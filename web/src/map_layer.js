// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Shows WHERE the data is on the map: every grid cell with any recorded detection is a square, brighter = more
// detections over all years (log scale). A place with no square has no detections recorded, so choosing it gives nothing.
// The squares are only a picture: clicks go through them to the map.

// Total of the harmonized weekly counts of every cell (VIIRS scale), in the same order as `cells`.
function cellTotals(cells, config) {
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
  const maxLog = Math.log(1 + totals.reduce(function (a, b) { return Math.max(a, b); }, 0)) || 1;

  // A pane under the other layers, so the region box, your area and the triage cells stay on top.
  if (!map.getPane("density")) map.createPane("density").style.zIndex = 350;

  const group = L.layerGroup();
  cells.forEach(function (cell, i) {
    const strength = Math.log(1 + totals[i]) / maxLog;          // 0 to 1
    L.rectangle([[cell.lat - half, cell.lon - half], [cell.lat + half, cell.lon + half]], {
      pane: "density", stroke: false, fillColor: "#34c7d6", fillOpacity: 0.15 + 0.7 * strength, interactive: false
    }).addTo(group);
  });
  group.addTo(map);

  // Legend (static text, built with DOM calls)
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const box = L.DomUtil.create("div", "map-legend");
    const title = document.createElement("div");
    title.className = "map-legend-title";
    title.textContent = "Fire detections recorded";
    const bar = document.createElement("div");
    bar.className = "map-legend-bar";
    const scale = document.createElement("div");
    scale.className = "map-legend-scale";
    ["fewer", "more"].forEach(function (text) {
      const span = document.createElement("span");
      span.textContent = text;
      scale.appendChild(span);
    });
    const note = document.createElement("div");
    note.textContent = "No square: none recorded";
    box.appendChild(title);
    box.appendChild(bar);
    box.appendChild(scale);
    box.appendChild(note);
    L.DomEvent.disableClickPropagation(box);                     // a click on the legend must not start an area
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
    const south = anchor.lat - step / 2, west = anchor.lon - step / 2;
    let sum = 0;
    cells.forEach(function (c, i) {
      if (c.lat >= south && c.lat < south + sizeDeg && c.lon >= west && c.lon < west + sizeDeg) sum += totals[i];
    });
    if (sum > bestSum) { bestSum = sum; best = { south: south, west: west }; }
  });
  return {
    south: best.south, west: best.west,
    north: Math.min(best.south + sizeDeg, box.north), east: Math.min(best.west + sizeDeg, box.east)
  };
}
