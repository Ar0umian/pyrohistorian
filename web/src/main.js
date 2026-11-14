// AI disclosure: written with help from Claude (Anthropic); reviewed by Owner B.
// Wires everything together.
import { loadAll } from "./config_loader.js";
import { initMap, getCellsInAoi } from "./map_aoi.js";
import { weeklySeries } from "./aggregate.js";
import { buildBaseline, classify, findCriticalPeriods, alarmKpis } from "./alarm_logic.js";
import { render as renderCalendar } from "./calendar_view.js";
import { render as renderReport } from "./report_view.js";

export async function start() {
  let data;
  try { data = await loadAll(); } catch (e) { return; }   // loadAll already showed the error
  const { config, meta, cells, validation } = data;

  const calendarEl = document.getElementById("calendar");
  const kpiEl = document.getElementById("kpis");
  let mode = config.ui.modes[0];
  let aoi = null;

  // Recompute everything for the current area + mode, then redraw.
  function update() {
    if (!aoi) { calendarEl.textContent = "Choose an area on the map to see the calendar."; kpiEl.textContent = ""; return; }
    const inAoi = getCellsInAoi(aoi, cells);
    if (inAoi.length === 0) { calendarEl.textContent = "No cells inside this area."; kpiEl.textContent = ""; return; }
    const series = weeklySeries(inAoi, mode, meta, config);
    const baseline = buildBaseline(series, config);
    const states = classify(series, baseline, config);
    const periods = findCriticalPeriods(states, config);
    const k = alarmKpis(states, periods, config);
    renderCalendar(calendarEl, series, states, config);
    kpiEl.textContent = "Critical periods: " + k.criticalPeriods + " | Longest alarm: " + k.longestAlarmWeeks +
      " weeks | Chattering: " + k.chatteringCount + " | Alarms per year: " + JSON.stringify(k.alarmsPerYear);
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