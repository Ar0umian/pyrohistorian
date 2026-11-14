// AI disclosure: written with help from Claude (Anthropic); reviewed by Owner B.
// Wires everything together.
import { loadAll } from "./config_loader.js";
import { initMap, getCellsInAoi } from "./map_aoi.js";
import { weeklySeries } from "./aggregate.js";
import { buildBaseline, classify, findCriticalPeriods, alarmKpis } from "./alarm_logic.js";
import { render as renderCalendar } from "./calendar_view.js";
import { render as renderReport } from "./report_view.js";
import { render as renderAlarmPanel } from "./alarm_panel.js";

export async function start() {
  let data;
  try { data = await loadAll(); } catch (e) { return; }   // loadAll already showed the error
  const { config, meta, cells, validation } = data;

  const calendarEl = document.getElementById("calendar");
  const kpiEl = document.getElementById("kpis");
  const alarmEl = document.getElementById("alarm-panel");
  let mode = config.ui.modes[0];
  let aoi = null;

  // Recompute everything for the current area + mode, then redraw.
  function update() {
    if (!aoi) { calendarEl.textContent = "Choose an area on the map to see the calendar and the alarm summary."; kpiEl.textContent = ""; alarmEl.textContent = ""; return; }
    const inAoi = getCellsInAoi(aoi, cells);
    if (inAoi.length === 0) { calendarEl.textContent = "No cells inside this area."; kpiEl.textContent = ""; alarmEl.textContent = ""; return; }
    const series = weeklySeries(inAoi, mode, meta, config);
    const baseline = buildBaseline(series, config);
    const states = classify(series, baseline, config);
    const periods = findCriticalPeriods(states, config);
    const k = alarmKpis(states, periods, config);
    renderCalendar(calendarEl, series, states, config);
    kpiEl.textContent = "";                       // the KPI tiles are now inside the alarm panel
    renderAlarmPanel({ container: alarmEl, series: series, states: states, baseline: baseline,
                       periods: periods, kpis: k, meta: meta, config: config });
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