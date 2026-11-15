// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Click-to-select with a live preview. Moving the pointer lights up (in white) the cells WITH NASA data that a click
// would select, and a readout says how much data is there. Where there is no data nothing lights up and a click does nothing.
import { selectArea, setMessage } from "./map_aoi.js";
import { cellTotals, findBusiestArea } from "./map_layer.js";

const SIZES = [1, 2, 3, 5];   // side of the selection window in degrees
const CELL_STYLE = { stroke: false, fillColor: "#ffffff", fillOpacity: 0.45, interactive: false };
const FRAME_STYLE = { color: "#ffffff", weight: 2, fill: false, interactive: false };
const IDLE_TEXT = "Move the pointer over the map to see what a click selects.";
const FEW_CELLS = 5;          // below this the results are thin: a warning is shown

let sizeDeg = 2;

function fmtInt(n) { return Math.round(n).toLocaleString(); }

// options = { map, cells, config, container }  (container = the element that receives the size buttons)
export function enablePicker(options) {
  const map = options.map, cells = options.cells, config = options.config, container = options.container;
  if (!map || typeof L === "undefined") return;
  const step = config.grid.step_deg, box = config.regions[0].bbox, half = step / 2;
  const rowsTotal = Math.max(1, Math.round((box.north - box.south) / step));
  const colsTotal = Math.max(1, Math.round((box.east - box.west) / step));

  // The cells with data, found by their row and column on the grid.
  const totals = cellTotals(cells, config);
  const byKey = new Map();
  cells.forEach(function (cell, i) {
    if (!(totals[i] > 0)) return;
    const r = Math.round((cell.lat - box.south) / step - 0.5);
    const c = Math.round((cell.lon - box.west) / step - 0.5);
    byKey.set(r + "," + c, { lat: cell.lat, lon: cell.lon, total: totals[i] });
  });

  // The window (whole cells) of the chosen size around a point, kept inside the region.
  function windowAt(latlng) {
    const n = Math.max(1, Math.round(sizeDeg / step));
    const nr = Math.min(n, rowsTotal), nc = Math.min(n, colsTotal);
    let r0 = Math.round((latlng.lat - box.south) / step - nr / 2);
    let c0 = Math.round((latlng.lng - box.west) / step - nc / 2);
    r0 = Math.max(0, Math.min(rowsTotal - nr, r0));
    c0 = Math.max(0, Math.min(colsTotal - nc, c0));
    return { r0: r0, c0: c0, nr: nr, nc: nc };
  }
  function boundsOf(w) {
    const south = box.south + w.r0 * step, west = box.west + w.c0 * step;
    return { south: south, west: west, north: south + w.nr * step, east: west + w.nc * step };
  }
  function statsOf(w) {
    const found = [];
    let total = 0;
    for (let r = w.r0; r < w.r0 + w.nr; r++) {
      for (let c = w.c0; c < w.c0 + w.nc; c++) {
        const e = byKey.get(r + "," + c);
        if (e) { found.push(e); total += e.total; }
      }
    }
    return { found: found, total: total, cellsInWindow: w.nr * w.nc };
  }

  // ---- live preview and readout ----
  const canvas = L.canvas({ padding: 0.5 });          // canvas: fast to redraw while the pointer moves
  const hoverLayer = L.layerGroup().addTo(map);
  let readoutBox = null;
  const readout = L.control({ position: "topright" });
  readout.onAdd = function () {
    readoutBox = L.DomUtil.create("div", "map-readout");
    readoutBox.textContent = IDLE_TEXT;
    L.DomEvent.disableClickPropagation(readoutBox);
    return readoutBox;
  };
  readout.addTo(map);

  let lastKey = null;
  function clearPreview() {
    hoverLayer.clearLayers();
    lastKey = null;
    if (readoutBox) readoutBox.textContent = IDLE_TEXT;
  }

  function preview(latlng) {
    const w = windowAt(latlng);
    const key = w.r0 + "," + w.c0 + "," + sizeDeg;
    if (key === lastKey) return;                      // same window as before: nothing to redraw
    lastKey = key;
    hoverLayer.clearLayers();
    const s = statsOf(w);
    if (s.found.length === 0) {
      readoutBox.textContent = "No NASA data here (sea, or nothing recorded). Move onto the shaded squares.";
      return;
    }
    s.found.forEach(function (cell) {
      L.rectangle([[cell.lat - half, cell.lon - half], [cell.lat + half, cell.lon + half]], Object.assign({ renderer: canvas }, CELL_STYLE)).addTo(hoverLayer);
    });
    const b = boundsOf(w);
    L.rectangle([[b.south, b.west], [b.north, b.east]], Object.assign({ renderer: canvas }, FRAME_STYLE)).addTo(hoverLayer);
    readoutBox.textContent = sizeDeg + " x " + sizeDeg + " degrees: " + s.found.length + " of " + s.cellsInWindow +
      " cells have data, " + fmtInt(s.total) + " detections (all years). Click to select.";
  }

  map.on("mousemove", function (e) { preview(e.latlng); });
  map.on("mouseout", clearPreview);
  map.on("click", function (e) {
    const w = windowAt(e.latlng);
    const s = statsOf(w);
    if (s.found.length === 0) {
      setMessage("There is no NASA data in that window. Click where the squares light up.");
      return;
    }
    selectArea(boundsOf(w));
    setMessage("Area selected: " + s.found.length + " cells with data." +
      (s.found.length < FEW_CELLS ? " Very few cells, so the results will be thin." : "") + " Hover and click again to choose another.");
  });

  // ---- controls: size buttons and two quick buttons ----
  if (!container) return;
  container.textContent = "";
  const label = document.createElement("span");
  label.className = "aoi-label";
  label.textContent = "Area size";
  container.appendChild(label);

  const group = document.createElement("span");
  group.className = "size-group";
  const sizeButtons = [];
  SIZES.forEach(function (s) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.textContent = s + "°";
    b.setAttribute("aria-pressed", String(s === sizeDeg));
    b.onclick = function () {
      sizeDeg = s;
      sizeButtons.forEach(function (x) { x.button.setAttribute("aria-pressed", String(x.size === sizeDeg)); });
      clearPreview();
    };
    sizeButtons.push({ size: s, button: b });
    group.appendChild(b);
  });
  container.appendChild(group);

  const busiest = document.createElement("button");
  busiest.type = "button";
  busiest.className = "btn";
  busiest.textContent = "Busiest area";
  busiest.onclick = function () {
    const a = findBusiestArea(cells, config, sizeDeg);
    if (!a) return;
    selectArea(a);
    setMessage("Busiest " + sizeDeg + " x " + sizeDeg + " degree area selected. Hover and click to choose another.");
  };
  container.appendChild(busiest);

  const whole = document.createElement("button");
  whole.type = "button";
  whole.className = "btn";
  whole.textContent = "Whole region";
  whole.onclick = function () {
    selectArea({ south: box.south, west: box.west, north: box.north, east: box.east });
    setMessage("Whole region selected. Hover and click to choose a smaller area.");
  };
  container.appendChild(whole);
}
