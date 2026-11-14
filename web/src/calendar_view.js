// AI disclosure: written with help from Claude (Anthropic); dark-theme version, must be reviewed by the team.
// Year x week matrix, newest year on top. Grey = Normal; colours only for abnormal; hatched = converted (q = U).
import { el, stateColor, qualityLabel } from "./ui.js";

// states[year][week] = {value, low, high, q, state}
export function render(container, series, states, config) {
  container.textContent = "";
  const years = Object.keys(states).sort().reverse();
  if (years.length === 0) { container.textContent = "No data for this area."; return; }
  const W = config.time.weeks_per_year;

  const wrap = el("div", null, "cal-wrap");
  const table = el("table", null, "cal");
  const head = table.insertRow();
  head.insertCell();
  for (let w = 1; w <= W; w++) {
    head.insertCell().textContent = w % 4 === 1 ? w : "";
  }

  years.forEach(function (y) {
    const row = table.insertRow();
    const label = row.insertCell();
    label.textContent = y;
    label.className = "cal-year";
    for (let w = 1; w <= W; w++) {
      const td = row.insertCell();
      const c = states[y][w];
      if (!c) { td.className = "cal-missing"; td.title = y + " week " + w + ": missing"; continue; }
      td.style.backgroundColor = stateColor(config, c.state);
      if (c.q === "U") {                                  // hatched overlay for converted values
        td.style.backgroundImage = "repeating-linear-gradient(45deg, rgba(0,0,0,0.55) 0 2px, transparent 2px 5px)";
      }
      td.title = y + " week " + w + ": " + Math.round(c.value * 10) / 10 + " (low " + Math.round(c.low * 10) / 10 +
        ", high " + Math.round(c.high * 10) / 10 + ") - " + qualityLabel(config, c.q) + " - " + c.state;
    }
  });
  wrap.appendChild(table);
  container.appendChild(wrap);

  // Legend
  const legend = el("div", null, "legend");
  function item(swatchStyle, text, extraClass) {
    const span = el("span");
    const sw = el("span", null, "swatch" + (extraClass ? " " + extraClass : ""));
    if (swatchStyle) sw.style.background = swatchStyle;
    span.appendChild(sw);
    span.appendChild(document.createTextNode(text));
    legend.appendChild(span);
  }
  config.alarm.states.forEach(function (s) { item(stateColor(config, s), s); });
  item("#5b6475 repeating-linear-gradient(45deg, rgba(0,0,0,0.55) 0 2px, transparent 2px 5px)", "converted (uncertain)");
  item(null, "missing", "swatch-missing");
  container.appendChild(legend);
}
