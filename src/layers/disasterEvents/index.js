import * as Cesium from 'cesium';
import {
  DISASTER_EVENTS_OVERLAY_SOURCE_ID,
  EVENT_TYPE_LABELS,
  alertAccent,
  buildEventCard,
} from './cards.js';
export { createGdacsEventSource } from './source.js';
export * from './cards.js';

const LAYER_ID = 'disaster-events';
const PICK_PREFIX = 'disaster-event:';
const UNAVAILABLE = 'Disaster events unavailable';
const MARKER_PIXELS = Object.freeze({ green: 9, orange: 12, red: 15 });
const LEGEND_LEVELS = ['red', 'orange', 'green'];
const LABEL_SOURCE_ID = 'disaster-events-labels';
const LABEL_HOST_OPTIONS = Object.freeze({
  cohortLimit: 96,
  collisionCapacity: 48,
  moving: false,
});
const CARD_HOST_OPTIONS = Object.freeze({
  cohortLimit: 1,
  collisionCapacity: 1,
  moving: false,
});

const timeOrNull = (iso) => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

function markerEntity(event) {
  const color = Cesium.Color.fromCssColorString(alertAccent(event.alertLevel));
  return new Cesium.Entity({
    id: `${PICK_PREFIX}${event.id}`,
    position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat),
    point: {
      pixelSize: MARKER_PIXELS[event.alertLevel],
      color: color.withAlpha(0.9),
      outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/** The type code above the dot tells an earthquake from a flood at a glance. */
function typeLabelEntry(event) {
  return {
    id: event.id,
    position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat),
    variant: 'label',
    title: event.type,
    accent: alertAccent(event.alertLevel),
    priority: MARKER_PIXELS[event.alertLevel],
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: false,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 12,
    verticalOnly: true,
    placement: 'above',
  };
}

/** Own one GDACS disaster-event display, its refresh lifecycle and click selection. */
export function createDisasterEventsLayer({
  source,
  overlayHost = null,
  screenSpaceEventHandlerFactory = null,
  picking = null,
  pointer = null,
  openExternal = null,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Disaster events require a snapshot source');
  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _stale = false;
  let _enabled = false;
  let _clickHandler = null;
  let _selectedId = null;
  let _selectedCardId = null;
  /** @type {Map<string, object>} */
  const _events = new Map();

  const canSelect = () =>
    overlayHost && screenSpaceEventHandlerFactory && picking;

  function open(event) {
    if (!openExternal) return false;
    openExternal(event.reportUrl);
    return true;
  }

  function publishSelectedCard() {
    if (!canSelect()) return;
    const event = _selectedId ? _events.get(_selectedId) : null;
    if (!event) {
      _selectedId = null;
      _selectedCardId = null;
      overlayHost.setEntries(
        DISASTER_EVENTS_OVERLAY_SOURCE_ID,
        [],
        CARD_HOST_OPTIONS,
      );
      return;
    }
    const card = {
      ...buildEventCard(event),
      position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat),
      interactive: Boolean(openExternal),
      activate: () => open(event),
    };
    _selectedCardId = card.id;
    overlayHost.setEntries(
      DISASTER_EVENTS_OVERLAY_SOURCE_ID,
      [card],
      CARD_HOST_OPTIONS,
    );
  }

  const ownsPick = (pickId) =>
    _enabled &&
    typeof pickId === 'string' &&
    pickId.startsWith(PICK_PREFIX) &&
    _events.has(pickId.slice(PICK_PREFIX.length));

  function installClickHandler() {
    if (!canSelect() || _clickHandler || !_viewer) return;
    picking.registerPickOwner?.(LAYER_ID, ownsPick);
    _clickHandler = screenSpaceEventHandlerFactory(_viewer);
    _clickHandler.setInputAction((click) => {
      if (pointer && !pointer.isPointerFree()) return;
      const cardHit = overlayHost.hitTest?.(
        click.position?.x,
        click.position?.y,
        { sourceId: DISASTER_EVENTS_OVERLAY_SOURCE_ID },
      );
      if (cardHit && cardHit.entryId === _selectedCardId) {
        const event = _events.get(_selectedId);
        if (event) open(event);
        return;
      }
      const picked = _viewer.scene.pick(click.position);
      const pickId = picked ? picking.resolvePickId(picked) : null;
      if (ownsPick(pickId)) {
        _selectedId = pickId.slice(PICK_PREFIX.length);
        publishSelectedCard();
        return;
      }
      if (pickId && picking.isOwnedByOtherLayer(LAYER_ID, pickId)) return;
      if (_selectedId) {
        _selectedId = null;
        publishSelectedCard();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    picking?.unregisterPickOwner?.(LAYER_ID);
    _clickHandler?.destroy();
    _clickHandler = null;
  }

  function clearSelection() {
    _selectedId = null;
    _selectedCardId = null;
    overlayHost?.clearSource(DISASTER_EVENTS_OVERLAY_SOURCE_ID);
    overlayHost?.setVisible?.(DISASTER_EVENTS_OVERLAY_SOURCE_ID, false);
  }

  function clearLabels() {
    overlayHost?.clearSource(LABEL_SOURCE_ID);
    overlayHost?.setVisible?.(LABEL_SOURCE_ID, false);
  }

  function replaceEvents(events) {
    _events.clear();
    _dataSource.entities.removeAll();
    for (const event of events) {
      _events.set(event.id, event);
      _dataSource.entities.add(markerEntity(event));
    }
    overlayHost?.setEntries(
      LABEL_SOURCE_ID,
      events.map(typeLabelEntry),
      LABEL_HOST_OPTIONS,
    );
    if (_selectedId) publishSelectedCard();
  }

  const layer = {
    id: LAYER_ID,
    name: 'Disaster Events',
    icon: '⚠',
    source: 'GDACS',
    updateInterval: 600000,

    init(viewer) {
      if (_viewer)
        throw new Error('Disaster event layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      console.log('[Data:DisasterEvents] Initialized');
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost?.setVisible?.(DISASTER_EVENTS_OVERLAY_SOURCE_ID, true);
      overlayHost?.setVisible?.(LABEL_SOURCE_ID, true);
      installClickHandler();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      removeClickHandler();
      clearSelection();
      clearLabels();
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        if (snapshot.unavailable) {
          // Never keep showing events the proxy can no longer vouch for.
          replaceEvents([]);
          _stale = false;
          _lastError = snapshot.reason || UNAVAILABLE;
          return false;
        }
        replaceEvents(snapshot.events);
        _stale = snapshot.stale === true;
        _lastUpdate = Date.now();
        _lastError = null;
        console.log(`[Data:DisasterEvents] Updated: ${_events.size} events`);
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:DisasterEvents] Fetch error:', e);
        _lastError = e?.message || UNAVAILABLE;
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      removeClickHandler();
      clearSelection();
      clearLabels();
      _events.clear();
      _enabled = false;
      _viewer = null;
      if (_dataSource) {
        viewer.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _lastUpdate = null;
      _lastError = null;
      _stale = false;
    },

    /** Snapshot event facts for the analyst query engine; [] while hidden. */
    getAnalystRecords(maxCount = 2000) {
      if (!_dataSource?.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      return [..._events.values()].slice(0, limit).map((event) => ({
        id: event.id,
        type: event.type,
        typeLabel: EVENT_TYPE_LABELS[event.type],
        name: event.name,
        alertLevel: event.alertLevel,
        country: event.country,
        severity: event.severity,
        isCurrent: event.isCurrent,
        fromTime: timeOrNull(event.fromDate),
        toTime: timeOrNull(event.toDate),
        reportUrl: event.reportUrl,
        lat: event.lat,
        lon: event.lon,
      }));
    },

    getRowControls() {
      const events = [..._events.values()];
      return {
        chips: [],
        legend: LEGEND_LEVELS.map((level, index) => ({
          label: `${level[0].toUpperCase()}${level.slice(1)} alert`,
          color: alertAccent(level),
          count: events.filter((event) => event.alertLevel === level).length,
          ...(index === 0
            ? {
                blurb:
                  'GDACS alert level. Letters mark the type: EQ earthquake, TC cyclone, FL flood, VO volcano, WF wildfire, DR drought.',
              }
            : {}),
        })),
      };
    },

    getStats() {
      return {
        count: _events.size,
        lastUpdate: _lastUpdate,
        error: _lastError,
        stale: _stale,
      };
    },
  };
  return layer;
}
