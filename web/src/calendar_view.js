// AI disclosure: written with help from Claude (Anthropic); reviewed by Owner B.
// Year x week matrix. Grey = Normal; colours only for abnormal; hatched = converted (q = U).

// Colour names in config.ui.state_colors -> CSS values (unknown names are used as-is).
const CSS_COLORS = { grey: "#cfcfcf", amber: "#ffb300", red: "#d32f2f" };

// states[year][week] = {value, low, high, q, state}
export function render(container, series, states, config) {
  container.textContent = "";
  const years = Object.keys(states).sort();
  if (years.length === 0) { container.textContent = "No data for this area."; return; }
  const W = config.time.weeks_per_year;
  const table = document.createElement("table");
  table.style.borderCollapse = "collapse";

  const head = table.insertRow();
  head.insertCell().textContent = "Year";
  for (let w = 1; w <= W; w++) {
    const th = head.insertCell();
    th.textContent = w % 4 === 1 ? w : "";
    th.style.fontSize = "10px";
  }

  years.forEach(function (y) {
    const row = table.insertRow();
    row.insertCell().textContent = y;
    for (let w = 1; w <= W; w++) {
      const td = row.insertCell();
      td.style.cssText = "width:12px;height:14px;min-width:12px;border:1px solid #fff";
      const c = states[y][w];
      if (!c) { td.style.background = "#f4f4f4"; td.title = y + " week " + w + ": missing"; continue; }
      const colorName = config.ui.state_colors[c.state];
      td.style.backgroundColor = CSS_COLORS[colorName] || colorName;
      if (c.q === "U") {                                  // hatched overlay for converted values
        td.style.backgroundImage = "repeating-linear-gradient(45deg, rgba(0,0,0,0.45) 0 2px, transparent 2px 5px)";
      }
      const label = config.quality_codes[c.q] ? config.quality_codes[c.q].label : c.q;
      td.title = y + " week " + w + ": " + c.value + " (low " + c.low + ", high " + c.high + ") - " + label + " - " + c.state;
    }
  });
  container.appendChild(table);
}