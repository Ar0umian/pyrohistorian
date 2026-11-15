// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// SIGNAL TRIAGE console (interactive). VIIRS is very sensitive: it picks up the faintest signals and every
// one of them could trigger an action. The user decides how strong a VIIRS signal must be to reach the
// emergency list and sees at once what that choice does. MODIS (less sensitive) is used only as an
// independent check of the result, never as part of the rule.
// CAUTION: "not seen by MODIS" does not mean "false": a small real fire can be below MODIS's detection limit.
import { el, svgEl, weekLabel } from "./ui.js";
import { evaluate, sensorProfile } from "./referee.js";

// TODO(verify): not in config. Starting value of the slider. On the data it takes about 29% of the
// signals off the emergency list and keeps about 90% of what MODIS confirmed.
const DEFAULT_MIN_STRENGTH = 5;
const MAX_STRENGTH = 30;
const CHART = { w: 420, h: 270, left: 46, right: 12, top: 14, bottom: 44 };

// How a cell is drawn on the map in the selected week.
const KINDS = {
  "kept-confirmed": { label: "On the emergency list, also seen by MODIS", style: { color: "#ff5470", weight: 1, fillColor: "#ff5470", fillOpacity: 0.75 } },
  "kept-unconfirmed": { label: "On the emergency list, VIIRS only", style: { color: "#ffb300", weight: 1, fillColor: "#ffb300", fillOpacity: 0.7 } },
  "dropped": { label: "Low priority (below your threshold)", style: { color: "#6b7385", weight: 1, fillColor: "#6b7385", fillOpacity: 0.4 } },
  "dropped-confirmed": { label: "Low priority but MODIS saw it (the risk)", style: { color: "#ff5470", weight: 2, fillColor: "#6b7385", fillOpacity: 0.4 } },
  "modis-only": { label: "Seen by MODIS only", style: { color: "#4aa3ff", weight: 2, fillColor: "#4aa3ff", fillOpacity: 0.12 } }
};

let minStrength = DEFAULT_MIN_STRENGTH;   // kept when the area changes
let layer = null;                          // the week layer on the map

function pct(x) { return x === null ? "-" : Math.round(x * 100) + "%"; }
function policyOf(t) { return { minStrength: t, minNeighbours: 0, keepPersistent: false }; }

// The strength threshold chosen with the slider (stays when the area changes).
export function getMinStrength() { return minStrength; }

// Remove the week layer from the map (used when the area changes).
export function clear(map) {
  if (layer && map) map.removeLayer(layer);
  layer = null;
}

function makeTile(label) {
  const box = el("div", null, "kpi");
  box.appendChild(el("div", label, "kpi-label"));
  const value = el("div", "-", "kpi-value");
  const note = el("div", "", "kpi-note");
  box.appendChild(value);
  box.appendChild(note);
  return { box: box, value: value, note: note };
}

// Trade-off curve: x = share of signals taken off the list, y = share of MODIS-confirmed signals still kept.
function buildChart(signals) {
  const plotW = CHART.w - CHART.left - CHART.right, plotH = CHART.h - CHART.top - CHART.bottom;
  const x = function (v) { return CHART.left + v * plotW; };
  const y = function (v) { return CHART.top + (1 - v) * plotH; };
  const svg = svgEl("svg", { viewBox: "0 0 " + CHART.w + " " + CHART.h, width: "100%", role: "img" });
  svg.setAttribute("aria-label", "Trade-off between the work removed and the confirmed signals kept");

  [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
    svg.appendChild(svgEl("line", { x1: x(0), x2: x(1), y1: y(v), y2: y(v), stroke: "#263042" }));
    const ty = svgEl("text", { x: CHART.left - 6, y: y(v) + 3, "text-anchor": "end", "font-size": "10", fill: "#8b97ab" });
    ty.textContent = Math.round(v * 100) + "%";
    svg.appendChild(ty);
    const tx = svgEl("text", { x: x(v), y: y(0) + 14, "text-anchor": "middle", "font-size": "10", fill: "#8b97ab" });
    tx.textContent = Math.round(v * 100) + "%";
    svg.appendChild(tx);
  });
  // What removing signals at random would give.
  svg.appendChild(svgEl("line", { x1: x(0), y1: y(1), x2: x(1), y2: y(0), stroke: "#8b97ab", "stroke-dasharray": "4 3" }));

  const points = [];
  for (let t = 1; t <= MAX_STRENGTH; t++) {
    const e = evaluate(signals, policyOf(t));
    if (e.loadCut === null || e.retained === null) continue;
    points.push({ t: t, cut: e.loadCut, kept: e.retained });
  }
  svg.appendChild(svgEl("polyline", {
    points: points.map(function (p) { return x(p.cut) + "," + y(p.kept); }).join(" "),
    fill: "none", stroke: "#4fd1c5", "stroke-width": "2"
  }));
  points.forEach(function (p) {
    const dot = svgEl("circle", { cx: x(p.cut), cy: y(p.kept), r: "3", fill: "#4fd1c5" });
    const tip = svgEl("title");
    tip.textContent = "at least " + p.t + " detections: " + pct(p.cut) + " of the signals removed, " + pct(p.kept) + " of the MODIS-confirmed ones kept";
    dot.appendChild(tip);
    svg.appendChild(dot);
  });
  const marker = svgEl("circle", { r: "6", fill: "#ffb300", stroke: "#ffffff", "stroke-width": "1.5" });
  svg.appendChild(marker);

  return {
    svg: svg,
    setMarker: function (e) {
      if (e.loadCut === null || e.retained === null) return;
      marker.setAttribute("cx", x(e.loadCut));
      marker.setAttribute("cy", y(e.retained));
    }
  };
}

// How often MODIS also sees a VIIRS signal, by the strength of the signal.
function buildTrust(evidence) {
  const box = el("div", null, "trust");
  box.appendChild(el("div", "How often MODIS also sees a VIIRS signal", "mini-title"));
  sensorProfile(evidence).byStrength.forEach(function (b) {
    const row = el("div", null, "trust-row");
    row.appendChild(el("span", b.label + (b.label === "1" ? " detection" : " detections"), "trust-label"));
    const bar = el("div", null, "bar");
    const fill = el("div", null, "bar-fill");
    fill.style.width = (b.rate === null ? 0 : Math.round(b.rate * 100)) + "%";
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(el("span", pct(b.rate), "trust-value"));
    box.appendChild(row);
  });
  box.appendChild(el("div", "Per cell and week. Only weeks watched by both sensors. The stronger the VIIRS signal, the more often the second sensor agrees.", "kpi-note"));
  return box;
}

// options = { container, map, signals, evidence, config }
export function render(options) {
  const container = options.container, config = options.config, map = options.map;
  const signals = options.signals, evidence = options.evidence;
  const step = config.grid.step_deg;
  clear(map);
  container.textContent = "";
  if (signals.length === 0) {
    container.textContent = "No VIIRS signal in weeks watched by both sensors in this area.";
    return;
  }

  const wrap = el("div", null, "triage");
  wrap.appendChild(el("p", "VIIRS catches the faintest signals, and every one of them can trigger an action. " +
    "Choose how strong a signal must be to reach the emergency list. MODIS, a second and less sensitive sensor, " +
    "is only used to check what your choice does.", "triage-intro"));

  // ---- the one control: signal strength ----
  const sliderRow = el("div", null, "slider-row");
  const label = el("label", null, "slider-label");
  label.appendChild(document.createTextNode("A signal is serious if a " + step + " degree cell has at least "));
  const valueSpan = el("strong", String(minStrength));
  label.appendChild(valueSpan);
  label.appendChild(document.createTextNode(" VIIRS detections in one week"));
  const slider = el("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = String(MAX_STRENGTH);
  slider.value = String(minStrength);
  sliderRow.appendChild(label);
  sliderRow.appendChild(slider);
  wrap.appendChild(sliderRow);

  // ---- numbers that react to the slider ----
  const tTotal = makeTile("VIIRS signals"), tKept = makeTile("On the emergency list"), tPure = makeTile("List seen by MODIS");
  const tRet = makeTile("Confirmed signals kept"), tRisk = makeTile("Risk: dropped but seen");
  const grid = el("div", null, "kpi-grid");
  [tTotal, tKept, tPure, tRet, tRisk].forEach(function (t) { grid.appendChild(t.box); });
  wrap.appendChild(grid);
  const summary = el("p", "", "summary-line");
  wrap.appendChild(summary);

  // ---- trade-off curve and sensor trust ----
  const chart = buildChart(signals);
  const left = el("div");
  left.appendChild(el("div", "What your choice costs", "mini-title"));
  left.appendChild(chart.svg);
  left.appendChild(el("div", "Across: share of signals taken off the emergency list. Up: share of MODIS-confirmed signals still on it. " +
    "The dashed line is what removing signals at random would give. The orange dot is your choice.", "kpi-note"));
  const two = el("div", null, "two-col");
  two.appendChild(left);
  two.appendChild(buildTrust(evidence));
  wrap.appendChild(two);

  // ---- week inspector (draws on the map) ----
  const weeks = Array.from(evidence.byIdx.values())
    .filter(function (ev) { return ev.overlap && ev.nViirs > 0; })
    .sort(function (a, b) { return a.idx - b.idx; });
  let weekPos = 0;
  weeks.forEach(function (ev, i) { if (ev.nViirs > weeks[weekPos].nViirs) weekPos = i; });   // start at the busiest week

  const weekBox = el("div", null, "week-box");
  weekBox.appendChild(el("div", "Week inspector: look at the map on the left", "mini-title"));
  const weekRow = el("div", null, "week-row");
  const weekSlider = el("input");
  weekSlider.type = "range";
  weekSlider.min = "0";
  weekSlider.max = String(weeks.length - 1);
  weekSlider.value = String(weekPos);
  const busiestBtn = el("button", "Busiest week", "btn");
  const latestBtn = el("button", "Latest week", "btn");
  weekRow.appendChild(weekSlider);
  weekRow.appendChild(busiestBtn);
  weekRow.appendChild(latestBtn);
  weekBox.appendChild(weekRow);
  const weekInfo = el("div", "", "week-info");
  weekBox.appendChild(weekInfo);
  const legend = el("div", null, "legend");
  Object.keys(KINDS).forEach(function (k) {
    const item = el("span");
    const sw = el("span", null, "swatch");
    sw.style.background = KINDS[k].style.fillColor;
    sw.style.borderColor = KINDS[k].style.color;
    item.appendChild(sw);
    item.appendChild(document.createTextNode(KINDS[k].label));
    legend.appendChild(item);
  });
  weekBox.appendChild(legend);
  wrap.appendChild(weekBox);
  container.appendChild(wrap);

  function kindOf(x) {
    if (x.nw > 0) {
      const kept = x.nw >= minStrength, seen = x.legacy > 0;
      if (kept) return seen ? "kept-confirmed" : "kept-unconfirmed";
      return seen ? "dropped-confirmed" : "dropped";
    }
    return x.legacy > 0 ? "modis-only" : null;
  }

  function drawWeek() {
    clear(map);
    const ev = weeks[weekPos];
    const count = { "kept-confirmed": 0, "kept-unconfirmed": 0, "dropped": 0, "dropped-confirmed": 0, "modis-only": 0 };
    if (map) layer = L.layerGroup();
    ev.cells.forEach(function (x) {
      const kind = kindOf(x);
      if (!kind) return;
      count[kind]++;
      if (!map) return;
      const half = step / 2;
      const rect = L.rectangle([[x.lat - half, x.lon - half], [x.lat + half, x.lon + half]], KINDS[kind].style);
      rect.bindTooltip(weekLabel(ev.year, ev.week) + ": VIIRS " + x.nw + " detections, MODIS " + x.legacy + " detections. " + KINDS[kind].label);
      layer.addLayer(rect);
    });
    if (map) layer.addTo(map);
    const keptCells = count["kept-confirmed"] + count["kept-unconfirmed"];
    const lowCells = count["dropped"] + count["dropped-confirmed"];
    weekInfo.textContent = weekLabel(ev.year, ev.week) + ": " + (keptCells + lowCells) + " cells with VIIRS signals, " + keptCells +
      " on the emergency list, " + lowCells + " low priority, " + count["modis-only"] + " seen by MODIS only.";
  }

  function updatePolicy() {
    const e = evaluate(signals, policyOf(minStrength));
    valueSpan.textContent = String(minStrength);
    tTotal.value.textContent = e.total.toLocaleString();
    tTotal.note.textContent = "cell-weeks seen by both sensors";
    tKept.value.textContent = e.kept.toLocaleString();
    tKept.note.textContent = pct(e.loadCut) + " less work";
    tPure.value.textContent = pct(e.keptConfirmShare);
    tPure.note.textContent = "of the list was also seen by MODIS";
    tRet.value.textContent = pct(e.retained);
    tRet.note.textContent = "of everything MODIS confirmed is still on the list";
    tRisk.value.textContent = pct(e.droppedConfirmShare);
    tRisk.note.textContent = "of the signals taken off the list were seen by MODIS";
    summary.textContent = "With at least " + minStrength + " detections, " + e.kept.toLocaleString() + " of " + e.total.toLocaleString() +
      " signals reach the emergency list (" + pct(e.loadCut) + " less work). " + pct(e.keptConfirmShare) + " of them were also seen by MODIS, " +
      "and you keep " + pct(e.retained) + " of everything MODIS confirmed. " +
      "The signals taken off the list are low priority, not necessarily false: " + pct(e.droppedConfirmShare) + " of them were seen by MODIS.";
    chart.setMarker(e);
    drawWeek();
    if (options.onChange) options.onChange(minStrength);
  }

  slider.oninput = function () { minStrength = Number(slider.value); updatePolicy(); };
  weekSlider.oninput = function () { weekPos = Number(weekSlider.value); drawWeek(); };
  busiestBtn.onclick = function () {
    weekPos = 0;
    weeks.forEach(function (ev, i) { if (ev.nViirs > weeks[weekPos].nViirs) weekPos = i; });
    weekSlider.value = String(weekPos);
    drawWeek();
  };
  latestBtn.onclick = function () { weekPos = weeks.length - 1; weekSlider.value = String(weekPos); drawWeek(); };
  updatePolicy();
}
