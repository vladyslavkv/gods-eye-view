import * as Cesium from 'cesium';
import { createSubmarineCableLayer } from '../../layers/submarineCables/index.js';
import { overlayHost } from './overlayHost.js';
import { hideOsmCredit, showOsmCredit } from '../../data/dataCredits.js';
/** Wire cable source geometry to the application overlay host. */
export function createApplicationCables(options) {
  return createSubmarineCableLayer({
    overlayHost,
    credits: { showOsmCredit, hideOsmCredit },
    screenSpaceEventHandlerFactory: (canvas) =>
      new Cesium.ScreenSpaceEventHandler(canvas),
    mapStackEventTarget: typeof window !== 'undefined' ? window : null,
    ...options,
  });
}
