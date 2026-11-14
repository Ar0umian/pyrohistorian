// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Wires everything together.
import { loadAll } from "./config_loader.js";
import { initMap, getCellsInAoi } from "./map_aoi.js";
import { weeklySeries } from "./aggregate.js";
import { buildBaseline, classify } from "./alarm_logic.js";
import { render as renderCalendar } from "./calendar_view.js";
import { render as renderReport } from "./report_view.js";
import { render as renderAlerts } from "./alerts.js";

export async function start() {
  let data;
  try { data = await loadAll(); } catch (e) { return; }   // loadAll already showed the error
  const { config, meta, cells, validation } = data;

  const calendarEl = document.getElementById("calendar");
  const alertsEl = document.getElementById("alerts");
  const countEl = document.getElementById("alert-count");
  let mode = config.ui.modes[0];
  let aoi = null;

  const end = meta.coverage && meta.coverage.new && meta.coverage.new.end;
  document.getElementById("data-badge").textContent = "Historical record" + (end ? " · data until " + end : "");

  // Recompute everything for the current area + mode, then redraw.
  function update() {
    if (!aoi) {
      calendarEl.textContent = "Choose an area on the map to see the alarm history.";
      alertsEl.textContent = "Choose an area on the map to see the alerts.";
      countEl.textContent = "";
      return;
    }
    const inAoi = getCellsInAoi(aoi, cells);
    if (inAoi.length === 0) {
      calendarEl.textContent = "No cells inside this area.";
      alertsEl.textContent = "No cells inside this area.";
      countEl.textContent = "";
      return;
    }
    const series = weeklySeries(inAoi, mode, meta, config);
    const baseline = buildBaseline(series, config);
    const states = classify(series, baseline, config);
    renderCalendar(calendarEl, series, states, config);
    renderAlerts({ container: alertsEl, countEl: countEl, series: series, states: states, baseline: baseline,
                   config: config, meta: meta, onSelect: function () {} });
  }

  // Mode toggle buttons from config.ui.modes
  const toggle = document.getElementById("mode-toggle");
  config.ui.modes.forEach(function (m) {
    const b = document.createElement("button");
    b.textContent = m;
    b.setAttribute("aria-pressed", String(m === mode));
    b.addEventListener("click", function () {
      mode = m;
      Array.from(toggle.children).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      update();
    });
    toggle.appendChild(b);
  });

  initMap(config, function (newAoi) { aoi = newAoi; update(); });
  renderReport(document.getElementById("report"), validation, meta, config);
  update();
}
