// AI disclosure: written with help from Claude (Anthropic); reviewed by Owner B.
// Leaflet map. The user clicks two opposite corners to make ONE rectangle (AOI).
// Uses the FIRST region in config.regions (assumption: one region).

let map = null;
let rect = null;
let firstCorner = null;

function say(text) {
  const el = document.getElementById("aoi-message");
  if (el) el.textContent = text;
}

function inside(bb, latlng) {
  return latlng.lat >= bb.south && latlng.lat <= bb.north && latlng.lng >= bb.west && latlng.lng <= bb.east;
}

// onChange(aoi) is called with {south, west, north, east} each time a rectangle is accepted.
export function initMap(config, onChange) {
  const bb = config.regions[0].bbox;
  const bounds = [[bb.south, bb.west], [bb.north, bb.east]];
  map = L.map("map");
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  L.rectangle(bounds, { color: "#555", weight: 1, fill: false, dashArray: "4" }).addTo(map); // region limit
  map.fitBounds(bounds);
  say("Click two opposite corners to choose an area. Bright squares show where fire detections were recorded; where there is no square, nothing was recorded.");

  map.on("click", function (e) {
    if (!inside(bb, e.latlng)) {
      firstCorner = null;
      say("That point is outside the region. Click inside the dashed box.");
      return;
    }
    if (firstCorner === null) {
      firstCorner = e.latlng;
      say("Now click the opposite corner.");
      return;
    }
    const a = firstCorner;
    const b = e.latlng;
    firstCorner = null;
    const aoi = {
      south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat),
      west: Math.min(a.lng, b.lng), east: Math.max(a.lng, b.lng)
    };
    if (rect) map.removeLayer(rect);
    rect = L.rectangle([[aoi.south, aoi.west], [aoi.north, aoi.east]], { color: "#1565c0", weight: 2 }).addTo(map);
    say("Area selected. Click again to choose a new one.");
    onChange(aoi);
  });
  return map;
}

// Return the cells whose centre lies inside the rectangle.
export function getCellsInAoi(aoi, cells) {
  return cells.filter(function (c) {
    return c.lat >= aoi.south && c.lat <= aoi.north && c.lon >= aoi.west && c.lon <= aoi.east;
  });
}