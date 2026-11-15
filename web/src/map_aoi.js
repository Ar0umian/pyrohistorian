// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Leaflet map. The area is chosen with ONE click: map_picker.js previews what a click would select.
// Uses the FIRST region in config.regions (assumption: one region).

let map = null;
let rect = null;
let changeCallback = null;

// Show a message above the map.
export function setMessage(text) {
  const el = document.getElementById("aoi-message");
  if (el) el.textContent = text;
}

// onChange(aoi) is called with {south, west, north, east} each time an area is selected.
export function initMap(config, onChange) {
  changeCallback = onChange;
  const bb = config.regions[0].bbox;
  const bounds = [[bb.south, bb.west], [bb.north, bb.east]];
  map = L.map("map", { scrollWheelZoom: false });   // the page scrolls even when the pointer is over the map; zoom with + and -
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  L.rectangle(bounds, { color: "#555", weight: 1, fill: false, dashArray: "4", interactive: false }).addTo(map);   // region limit
  map.fitBounds(bounds);
  setMessage("Move the pointer over the map: the squares that a click would select light up, and the readout says how much data is there.");
  return map;
}

// Return the cells whose centre lies inside the rectangle.
export function getCellsInAoi(aoi, cells) {
  return cells.filter(function (c) {
    return c.lat >= aoi.south && c.lat <= aoi.north && c.lon >= aoi.west && c.lon <= aoi.east;
  });
}

// Draw the selected area and tell the page.
export function selectArea(aoi) {
  if (!map) return;
  if (rect) map.removeLayer(rect);
  rect = L.rectangle([[aoi.south, aoi.west], [aoi.north, aoi.east]], { color: "#34c7d6", weight: 3, fill: false, interactive: false }).addTo(map);
  setMessage("Area selected. Hover and click again to choose another.");
  if (changeCallback) changeCallback(aoi);
}
