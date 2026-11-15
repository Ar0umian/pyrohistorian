// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Shows WHERE the NASA data is: every grid cell with recorded detections is shaded. Brightness compares the cells with
// each other (by rank, so the differences are visible). No square = nothing recorded there.
// The squares are only a picture: clicks go through them to the map.

// Total of the harmonized weekly counts of every cell (VIIRS scale), in the same order as `cells`.
export function cellTotals(cells, config) {
  const idx = config.schema.cells_weekly.value_fields.indexOf("harmonized");
  return cells.map(function (cell) {
    let total = 0;
    Object.keys(cell.data).forEach(function (key) {
      const h = cell.data[key][idx];
      if (Number.isFinite(h)) total += h;
    });
    return total;
  });
}

export function drawDataLayer(map, cells, config) {
  if (!map || typeof L === "undefined" || cells.length === 0) return null;
  const half = config.grid.step_deg / 2;
  const totals = cellTotals(cells, config);

  // Rank of each cell among the cells with data: 0 = fewest detections, 1 = most.
  const withData = [];
  totals.forEach(function (t, i) { if (t > 0) withData.push(i); });
  withData.sort(function (a, b) { return totals[a] - totals[b]; });
  const rank = new Map();
  withData.forEach(function (i, pos) { rank.set(i, withData.length > 1 ? pos / (withData.length - 1) : 1); });

  // A pane under the other layers, so your area and the triage cells stay on top.
  if (!map.getPane("density")) map.createPane("density").style.zIndex = 350;
  const group = L.layerGroup();
  withData.forEach(function (i) {
    const cell = cells[i];
    L.rectangle([[cell.lat - half, cell.lon - half], [cell.lat + half, cell.lon + half]], {
      pane: "density", stroke: false, fillColor: "#34c7d6", fillOpacity: 0.08 + 0.62 * rank.get(i), interactive: false
    }).addTo(group);
  });
  group.addTo(map);

  // Legend (static text, built with DOM calls)
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const box = L.DomUtil.create("div", "map-legend");
    function line(className, text) {
      const div = document.createElement("div");
      div.className = className;
      if (text) div.textContent = text;
      box.appendChild(div);
      return div;
    }
    line("map-legend-title", "NASA fire detections");
    line("map-legend-bar");
    const scale = line("map-legend-scale");
    ["fewer", "more"].forEach(function (text) {
      const span = document.createElement("span");
      span.textContent = text;
      scale.appendChild(span);
    });
    line("", "Brightness compares cells with each other. No square: nothing recorded.");
    const key = line("map-legend-key");
    const swatch = document.createElement("span");
    swatch.className = "map-legend-swatch";
    key.appendChild(swatch);
    key.appendChild(document.createTextNode("what a click selects"));
    L.DomEvent.disableClickPropagation(box);
    return box;
  };
  legend.addTo(map);
  return group;
}

// The square window of sizeDeg x sizeDeg degrees with the most detections (used by the "Busiest area" button).
export function findBusiestArea(cells, config, sizeDeg) {
  if (cells.length === 0) return null;
  const step = config.grid.step_deg;
  const box = config.regions[0].bbox;
  const totals = cellTotals(cells, config);
  let best = null, bestSum = -1;
  cells.forEach(function (anchor) {
    const south = Math.max(box.south, Math.min(anchor.lat - step / 2, box.north - sizeDeg));
    const west = Math.max(box.west, Math.min(anchor.lon - step / 2, box.east - sizeDeg));
    let sum = 0;
    cells.forEach(function (c, i) {
      if (c.lat > south && c.lat < south + sizeDeg && c.lon > west && c.lon < west + sizeDeg) sum += totals[i];
    });
    if (sum > bestSum) { bestSum = sum; best = { south: south, west: west }; }
  });
  return { south: best.south, west: best.west, north: Math.min(best.south + sizeDeg, box.north), east: Math.min(best.west + sizeDeg, box.east) };
}
