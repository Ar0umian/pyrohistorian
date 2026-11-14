// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Alarm panel in the style of an operator screen: status lamp, KPI tiles, weekly trend with
// alarm limits, alarm journal. The methods are BORROWED from industrial alarm management.
// This is NOT a control system, and the data are historical.

// Colour names in config.ui.state_colors -> CSS values (unknown names are used as-is).
const CSS_COLORS = { grey: "#cfcfcf", amber: "#ffb300", red: "#d32f2f" };
const SVG_NS = "http://www.w3.org/2000/svg";
const BOX_CSS = "border:1px solid #9a9a9a;margin:8px 0;background:#fff;font-family:system-ui,sans-serif;font-size:13px";
const CHART_W = 900, CHART_H = 260;
const MARGIN = { left: 46, right: 10, top: 12, bottom: 28 };

function stateColor(config, state) {
  const name = config.ui.state_colors[state];
  return CSS_COLORS[name] || name;
}

// Small helpers to build HTML / SVG elements (text always goes in with textContent).
function el(tag, text, css) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (css) node.style.cssText = css;
  return node;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
  return node;
}

function pad2(n) { return n < 10 ? "0" + n : String(n); }
function weekLabel(year, week) { return year + " W" + pad2(week); }
function fmt(v) { return Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "-"; }
function qualityLabel(config, q) { return config.quality_codes[q] ? config.quality_codes[q].label : q; }

// Round a number up to 1, 2, 5 or 10 x a power of ten (for the y axis).
function niceMax(x) {
  if (!(x > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * mag;
}

// The most recent week that has a value.
function findLatest(states, W) {
  let best = null;
  Object.keys(states).forEach(function (y) {
    Object.keys(states[y]).forEach(function (w) {
      const idx = Number(y) * W + Number(w) - 1;
      if (!best || idx > best.idx) best = { idx: idx, year: Number(y), week: Number(w), cell: states[y][w] };
    });
  });
  return best;
}

// Number of weeks in each state, and how many weeks are converted (q = U).
function summarize(states, config) {
  const counts = {};
  config.alarm.states.forEach(function (s) { counts[s] = 0; });
  let total = 0, converted = 0;
  Object.keys(states).forEach(function (y) {
    Object.keys(states[y]).forEach(function (w) {
      const c = states[y][w];
      if (counts[c.state] !== undefined) counts[c.state]++;
      total++;
      if (c.q === "U") converted++;
    });
  });
  return { counts: counts, total: total, converted: converted };
}

// Peak value and number of converted weeks inside one critical period.
function periodStats(period, states, W) {
  let peak = 0, converted = 0;
  for (let idx = period.startIdx; idx <= period.endIdx; idx++) {
    const y = Math.floor(idx / W), w = (idx % W) + 1;
    const c = states[y] && states[y][w];
    if (!c) continue;
    if (c.value > peak) peak = c.value;
    if (c.q === "U") converted++;
  }
  return { peak: peak, converted: converted };
}

// ---------- 1) status lamp ----------
function buildLamp(latest, config, meta) {
  const c = latest.cell;
  const row = el("div", null, "display:flex;align-items:center;gap:14px;padding:10px 14px;background:#ececec;border-bottom:1px solid #bbb");
  row.appendChild(el("div", null, "flex:none;width:36px;height:36px;border-radius:50%;border:2px solid #444;background:" + stateColor(config, c.state)));
  const text = el("div");
  text.appendChild(el("div", c.state, "font-size:20px;font-weight:700"));
  let line = "Last week with data: " + weekLabel(latest.year, latest.week) + " | " + fmt(c.value) + " detections";
  if (c.q === "U") line += " (range " + fmt(c.low) + " to " + fmt(c.high) + ")";
  line += " | " + qualityLabel(config, c.q);
  text.appendChild(el("div", line));
  const end = meta && meta.coverage && meta.coverage.new && meta.coverage.new.end;
  text.appendChild(el("div",
    "Historical record" + (end ? ", data until " + end : "") +
    ": the state means unusual compared with this area's own history, not a live alert.",
    "font-size:11px;color:#666"));
  row.appendChild(text);
  return row;
}

// ---------- 2) KPI tiles ----------
function tile(label, value, note) {
  const box = el("div", null, "flex:1 1 130px;border:1px solid #bbb;padding:6px 10px;background:#fafafa");
  box.appendChild(el("div", label, "font-size:11px;color:#555"));
  box.appendChild(el("div", value, "font-size:22px;font-weight:600"));
  if (note) box.appendChild(el("div", note, "font-size:11px;color:#777"));
  return box;
}

function buildTiles(kpis, summary, config) {
  const elevatedName = config.alarm.states[1], alarmName = config.alarm.states[2];
  const episodes = Object.keys(kpis.alarmsPerYear).reduce(function (sum, y) { return sum + kpis.alarmsPerYear[y]; }, 0);
  const pct = summary.total > 0 ? Math.round((100 * summary.converted) / summary.total) : 0;
  const row = el("div", null, "display:flex;flex-wrap:wrap;gap:8px;padding:10px 14px");
  row.appendChild(tile("Alarm episodes", episodes, "runs of " + alarmName + " weeks"));
  row.appendChild(tile("Critical periods", kpis.criticalPeriods, config.alarm.critical_min_weeks + "+ weeks in a row"));
  row.appendChild(tile("Longest alarm", kpis.longestAlarmWeeks, "weeks in a row"));
  row.appendChild(tile("Chattering alarms", kpis.chatteringCount, "restart after a short gap"));
  row.appendChild(tile("Weeks in " + alarmName, summary.counts[alarmName], "of " + summary.total + " weeks with data"));
  row.appendChild(tile("Weeks in " + elevatedName, summary.counts[elevatedName], "of " + summary.total + " weeks with data"));
  row.appendChild(tile("Converted weeks", pct + "%", "uncertain (hatched)"));
  return row;
}

// ---------- 3) weekly trend chart (SVG) ----------
function drawChart(holder, ctx, year, highlight) {
  const config = ctx.config;
  const W = config.time.weeks_per_year;
  const yearStates = ctx.states[year] || {};
  const yearBase = ctx.baseline[year] || {};
  const elevatedName = config.alarm.states[1], alarmName = config.alarm.states[2];

  // Biggest value (to scale the y axis): values, converted ranges and alarm limits.
  let maxV = 0;
  for (let w = 1; w <= W; w++) {
    const c = yearStates[w];
    if (c) {
      maxV = Math.max(maxV, c.value);
      if (Number.isFinite(c.high)) maxV = Math.max(maxV, c.high);
    }
    const b = yearBase[w];
    if (b) maxV = Math.max(maxV, b.alarm);
  }
  const top = niceMax(maxV);
  const plotW = CHART_W - MARGIN.left - MARGIN.right;
  const plotH = CHART_H - MARGIN.top - MARGIN.bottom;
  const bw = plotW / W;
  function xOf(w) { return MARGIN.left + (w - 1) * bw; }
  function yOf(v) { return MARGIN.top + plotH * (1 - v / top); }

  const svg = svgEl("svg", { viewBox: "0 0 " + CHART_W + " " + CHART_H, width: "100%", role: "img" });
  svg.style.maxWidth = CHART_W + "px";
  svg.setAttribute("aria-label", "Weekly detections for " + year + " with the alarm limits");

  // Hatch pattern for converted (uncertain) weeks.
  const defs = svgEl("defs");
  const pattern = svgEl("pattern", { id: "pyro-hatch", width: "5", height: "5", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pattern.appendChild(svgEl("rect", { width: "2", height: "5", fill: "rgba(0,0,0,0.45)" }));
  defs.appendChild(pattern);
  svg.appendChild(defs);

  // Grid lines and y labels.
  for (let i = 0; i <= 4; i++) {
    const v = (top * i) / 4, y = yOf(v);
    svg.appendChild(svgEl("line", { x1: MARGIN.left, x2: CHART_W - MARGIN.right, y1: y, y2: y, stroke: "#ddd" }));
    const label = svgEl("text", { x: MARGIN.left - 4, y: y + 3, "text-anchor": "end", "font-size": "10", fill: "#555" });
    label.textContent = String(Math.round(v * 100) / 100);
    svg.appendChild(label);
  }

  // Weeks: missing, or a bar coloured by state.
  for (let w = 1; w <= W; w++) {
    const c = yearStates[w];
    const head = weekLabel(year, w);
    if (!c) {
      const gap = svgEl("rect", { x: xOf(w), y: MARGIN.top, width: bw, height: plotH, fill: "#f4f4f4" });
      const t = svgEl("title"); t.textContent = head + ": missing";
      gap.appendChild(t);
      svg.appendChild(gap);
      continue;
    }
    const y = yOf(c.value);
    const geometry = { x: xOf(w) + bw * 0.1, y: y, width: bw * 0.8, height: Math.max(yOf(0) - y, 0) };
    const bar = svgEl("rect", Object.assign({ fill: stateColor(config, c.state) }, geometry));
    let tip = head + ": " + fmt(c.value) + " detections";
    if (c.q === "U") tip += " (range " + fmt(c.low) + " to " + fmt(c.high) + ")";
    tip += " - " + qualityLabel(config, c.q) + " - " + c.state;
    const t = svgEl("title"); t.textContent = tip;
    bar.appendChild(t);
    svg.appendChild(bar);
    if (c.q === "U") {
      svg.appendChild(svgEl("rect", Object.assign({ fill: "url(#pyro-hatch)" }, geometry)));
      if (Number.isFinite(c.low) && Number.isFinite(c.high)) {
        const cx = xOf(w) + bw / 2;
        svg.appendChild(svgEl("line", { x1: cx, x2: cx, y1: yOf(c.high), y2: yOf(c.low), stroke: "#222", "stroke-width": "1" }));
      }
    }
  }

  // Alarm limits (from the baseline built from the OTHER years): a step line across the weeks.
  function stepPath(field) {
    let d = "", prevY = null;
    for (let w = 1; w <= W; w++) {
      const b = yearBase[w];
      if (!b) { prevY = null; continue; }
      const y = yOf(b[field]);
      if (prevY === null) d += "M" + xOf(w) + " " + y;
      else if (y !== prevY) d += "V" + y;
      d += "H" + (xOf(w) + bw);
      prevY = y;
    }
    return d;
  }
  [["elevated", elevatedName], ["alarm", alarmName]].forEach(function (pair) {
    const d = stepPath(pair[0]);
    if (!d) return;
    const path = svgEl("path", { d: d, fill: "none", stroke: stateColor(config, pair[1]), "stroke-width": "2", "stroke-dasharray": "5 3" });
    const t = svgEl("title"); t.textContent = pair[1] + " limit";
    path.appendChild(t);
    svg.appendChild(path);
  });
  if (Object.keys(yearBase).length === 0) {
    const note = svgEl("text", { x: MARGIN.left + 6, y: MARGIN.top + 14, "font-size": "11", fill: "#777" });
    note.textContent = "No baseline for this year (too few other years): no limits are drawn.";
    svg.appendChild(note);
  }

  // Outline of the selected critical period.
  if (highlight) {
    for (let w = 1; w <= W; w++) {
      const idx = Number(year) * W + w - 1;
      if (idx < highlight.startIdx || idx > highlight.endIdx) continue;
      svg.appendChild(svgEl("rect", {
        x: xOf(w), y: MARGIN.top, width: bw, height: plotH, fill: "none",
        stroke: stateColor(config, alarmName), "stroke-width": "1.5", "stroke-dasharray": "3 2"
      }));
    }
  }

  // Week numbers.
  for (let w = 1; w <= W; w++) {
    if (w % 4 !== 1) continue;
    const label = svgEl("text", { x: xOf(w) + bw / 2, y: CHART_H - 12, "text-anchor": "middle", "font-size": "10", fill: "#555" });
    label.textContent = String(w);
    svg.appendChild(label);
  }
  const caption = svgEl("text", { x: MARGIN.left + plotW / 2, y: CHART_H - 1, "text-anchor": "middle", "font-size": "10", fill: "#555" });
  caption.textContent = "week of the year (detections per week)";
  svg.appendChild(caption);

  holder.textContent = "";
  holder.appendChild(svg);
}

function swatch(css) {
  return el("span", null, "display:inline-block;width:14px;height:14px;border:1px solid #777;vertical-align:middle;margin-right:4px;" + css);
}

function buildLegend(config) {
  const row = el("div", null, "display:flex;flex-wrap:wrap;gap:14px;font-size:12px;margin-top:4px");
  config.alarm.states.forEach(function (s) {
    const item = el("span");
    item.appendChild(swatch("background:" + stateColor(config, s)));
    item.appendChild(document.createTextNode(s));
    row.appendChild(item);
  });
  const hatched = el("span");
  hatched.appendChild(swatch("background:#cfcfcf repeating-linear-gradient(45deg, rgba(0,0,0,0.45) 0 2px, transparent 2px 5px)"));
  hatched.appendChild(document.createTextNode("converted (uncertain), line = low to high"));
  row.appendChild(hatched);
  row.appendChild(el("span", "dashed lines = limits from the other years"));
  return row;
}

// ---------- 4) alarm journal ----------
function buildJournal(periods, ctx, onSelect) {
  const config = ctx.config, W = config.time.weeks_per_year;
  const box = el("div", null, "padding:0 14px 10px");
  box.appendChild(el("div", "Alarm journal (critical periods: " + config.alarm.states[2] + " for " +
    config.alarm.critical_min_weeks + "+ weeks in a row). Click a row to see it in the trend.", "font-weight:600;margin:6px 0"));
  if (periods.length === 0) {
    box.appendChild(el("div", "No critical period in this area.", "color:#555"));
    return box;
  }
  const wrap = el("div", null, "max-height:220px;overflow:auto;border:1px solid #ccc");
  const table = el("table", null, "border-collapse:collapse;width:100%");
  const head = table.createTHead().insertRow();
  ["Start", "End", "Weeks", "Peak (detections/week)", "Converted weeks"].forEach(function (h) {
    const th = el("th", h, "text-align:left;padding:4px 8px;background:#ececec;position:sticky;top:0;border-bottom:1px solid #bbb");
    head.appendChild(th);
  });
  const body = table.createTBody();
  periods.slice().sort(function (a, b) { return b.startIdx - a.startIdx; }).forEach(function (p) {
    const stats = periodStats(p, ctx.states, W);
    const row = body.insertRow();
    row.style.cursor = "pointer";
    row.title = "Show this period in the trend";
    [weekLabel(p.startYear, p.startWeek), weekLabel(p.endYear, p.endWeek), p.weeks, fmt(stats.peak), stats.converted].forEach(function (v) {
      row.insertCell().textContent = String(v);
    });
    Array.prototype.forEach.call(row.cells, function (cell) { cell.style.cssText = "padding:3px 8px;border-bottom:1px solid #eee"; });
    row.onclick = function () { onSelect(p); };
  });
  wrap.appendChild(table);
  box.appendChild(wrap);
  return box;
}

// ---------- 5) how to read it ----------
function buildHelp(config) {
  const a = config.alarm;
  const details = el("details", null, "padding:0 14px 12px");
  details.appendChild(el("summary", "How to read this panel", "cursor:pointer;font-weight:600"));
  const list = el("ul", null, "margin:6px 0 0 18px;padding:0");
  [
    a.states[0] + " (grey): below the " + a.states[1] + " limit. Colour is used only for abnormal states.",
    a.states[1] + ": the weekly total is at or above the " + a.elevated_percentile + "th percentile of the same week in the other years, and at least " + a.min_abs_weekly_count + " detections.",
    a.states[2] + ": the weekly total is at or above the " + a.alarm_percentile + "th percentile of the same week in the other years.",
    "Hysteresis: a new state must hold for " + a.hysteresis_weeks + " week(s) in a row before the state changes (applied to the weekly total, never to raw detections).",
    "Critical period: " + a.states[2] + " for at least " + a.critical_min_weeks + " weeks in a row.",
    "Hatched bars are converted from the legacy sensor (MODIS) to the VIIRS scale, so they are uncertain; the line shows the low to high range.",
    "These are methods borrowed from industrial alarm management (ideas from standards such as ISA-18.2 and EEMUA 191). PyroHistorian is NOT a control system and does not control anything. The record is historical."
  ].forEach(function (text) { list.appendChild(el("li", text, "margin:3px 0")); });
  details.appendChild(list);
  return details;
}

// options = { container, series, states, baseline, periods, kpis, meta, config }
export function render(options) {
  const container = options.container, config = options.config;
  const states = options.states || {};
  container.textContent = "";
  const years = Object.keys(states).sort();
  const W = config.time.weeks_per_year;
  const latest = years.length > 0 ? findLatest(states, W) : null;
  if (!latest) { container.textContent = "No alarm data for this area."; return; }

  const ctx = { states: states, baseline: options.baseline || {}, config: config };
  const periods = options.periods || [];
  const kpis = options.kpis || { alarmsPerYear: {}, longestAlarmWeeks: 0, chatteringCount: 0, criticalPeriods: 0 };
  const summary = summarize(states, config);

  const panel = el("div", null, BOX_CSS);
  panel.appendChild(el("div", "ALARM SUMMARY (methods borrowed from industrial alarm management)",
    "background:#4a4a4a;color:#fff;padding:6px 14px;font-weight:600;letter-spacing:0.5px"));
  panel.appendChild(buildLamp(latest, config, options.meta));
  panel.appendChild(buildTiles(kpis, summary, config));

  // Trend chart with a year selector.
  const chartBox = el("div", null, "padding:0 14px 10px");
  const bar = el("div", null, "display:flex;align-items:center;gap:8px;margin-bottom:4px");
  bar.appendChild(el("strong", "Weekly trend for year:"));
  const select = el("select");
  years.slice().reverse().forEach(function (y) {
    const option = el("option", y);
    option.value = y;
    select.appendChild(option);
  });
  bar.appendChild(select);
  chartBox.appendChild(bar);
  const holder = el("div");
  chartBox.appendChild(holder);
  chartBox.appendChild(buildLegend(config));
  panel.appendChild(chartBox);

  function show(year, highlight) {
    select.value = String(year);
    drawChart(holder, ctx, String(year), highlight);
  }
  select.onchange = function () { show(select.value, null); };

  panel.appendChild(buildJournal(periods, ctx, function (period) { show(period.startYear, period); }));
  panel.appendChild(buildHelp(config));
  container.appendChild(panel);
  show(latest.year, null);
}
