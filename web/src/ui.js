// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Small helpers shared by the dashboard modules.

// Colour names in config.ui.state_colors -> CSS values for the dark theme (unknown names are used as-is).
const CSS_COLORS = { grey: "#5b6475", amber: "#ffb300", red: "#ff5470" };
const SVG_NS = "http://www.w3.org/2000/svg";

export function stateColor(config, state) {
  const name = config.ui.state_colors[state];
  return CSS_COLORS[name] || name;
}

// Make an HTML element. Text goes in with textContent (safe).
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
  return node;
}

export function pad2(n) { return n < 10 ? "0" + n : String(n); }
export function weekLabel(year, week) { return year + " W" + pad2(week); }
export function fmt(v) { return Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "-"; }
export function qualityLabel(config, q) { return config.quality_codes[q] ? config.quality_codes[q].label : q; }

// Month name of a week of the year (middle of the week, normal year).
export function monthName(week) {
  const d = new Date(Date.UTC(2001, 0, 1 + (week - 1) * 7 + 3));
  return d.toLocaleString("en", { month: "long", timeZone: "UTC" });
}

export function median(values) {
  const s = values.slice().sort(function (a, b) { return a - b; });
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Week index (year * W + week - 1) -> { year, week }
export function idxToYearWeek(idx, W) {
  return { year: Math.floor(idx / W), week: (idx % W) + 1 };
}
