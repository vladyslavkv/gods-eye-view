# Commercial configuration

Runtime settings an operator of a commercial deployment must decide on. Each
section belongs to one setting; sources and licence quotes are in
[DATA_SOURCES.md](../DATA_SOURCES.md).

## Basemap: `ESRI_IMAGERY_LICENSED`

| Value | Effect |
| --- | --- |
| unset (default), or anything other than `1` | The keyless landing basemap is **NASA Blue Marble** via NASA GIBS (public domain). The **Esri Satellite** tile is hidden from the MAP SOURCE row, and any other route to it (a share link, the `set_map_stack` voice tool) is refused with the reason "Esri World Imagery needs Esri software or an ArcGIS Online subscription; set ESRI_IMAGERY_LICENSED=1 once licensed". No Esri tile is requested. The Recent Imagery comparison globe is Blue Marble. |
| `1` | Esri World Imagery is offered as the **Esri Satellite** map stack (the MAP SOURCE row then shows six tiles in two rows of three) and becomes the Recent Imagery comparison globe. The keyless landing basemap stays Blue Marble. |

Why it is off by default: Esri's terms-of-use summary for its ArcGIS Online
items says "If you do not have Esri software, you must purchase an ArcGIS
Online subscription"
([tou_summary.pdf](https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf),
linked from the World Imagery item). Set the flag only when your deployment
holds Esri software or an ArcGIS Online subscription that covers this use.

How it reaches the browser: like the map keys (`GOOGLE_MAPS_API_KEY`,
`CESIUM_ION_TOKEN`), the server reads it from the environment or the dotenv
files when it starts (`npm run dev` / `npm run preview`) or when the bundle is
built (`npm run build`), and hands it to the page through Vite's `define`
(`build/vite.js`). Restart the server, or rebuild, after changing it. Only the
exact value `1` counts.
