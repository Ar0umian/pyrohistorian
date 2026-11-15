// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Wires everything together.
import { loadAll } from "./config_loader.js";
import { initMap, getCellsInAoi } from "./map_aoi.js";
import { weeklySeries } from "./aggregate.js";
import { buildBaseline, classify } from "./alarm_logic.js";
import { buildEvidence, buildSignals } from "./referee.js";
import { render as renderCalendar } from "./calendar_view.js";
import { render as renderReport } from "./report_view.js";
import { render as renderAlerts } from "./alerts.js";
import { render as renderTriage, clear as clearTriage, getMinStrength } from "./triage_console.js";
import { drawDataLayer } from "./map_layer.js";
import { enablePicker } from "./map_picker.js";

export async function start() {
  let data;
  try { data = await loadAll(); } catch (e) { return; }   // loadAll already showed the error
  const { config, meta, cells, validation } = data;

  const calendarEl = document.getElementById("calendar");
  const alertsEl = document.getElementById("alerts");
  const countEl = document.getElementById("alert-count");
  const triageEl = document.getElementById("triage");
  // Alarms and the calendar always use the harmonized series: that is the one the triage is about.
  const mode = config.ui.modes.indexOf("harmonized") >= 0 ? "harmonized" : config.ui.modes[config.ui.modes.length - 1];
  let aoi = null;
  let map = null;
  let alerts = null;                                           // controller of the alarm cards
  let cache = { key: null, evidence: null, signals: null };   // evidence and signals only change with the area

  const end = meta.coverage && meta.coverage.new && meta.coverage.new.end;
  document.getElementById("data-badge").textContent = "Historical record" + (end ? " · data until " + end : "");

  function showMessage(text) {
    calendarEl.textContent = text;
    alertsEl.textContent = text;
    triageEl.textContent = text;
    countEl.textContent = "";
    clearTriage(map);
  }

  // Recompute everything for the current area, then redraw.
  function update() {
    alerts = null;
    if (!aoi) { showMessage("Choose an area on the map first."); return; }
    const inAoi = getCellsInAoi(aoi, cells);
    if (inAoi.length === 0) { showMessage("No cells inside this area."); return; }

    const key = [aoi.south, aoi.west, aoi.north, aoi.east].join(",");
    if (cache.key !== key) {
      const evidence = buildEvidence(inAoi, meta, config);
      cache = { key: key, evidence: evidence, signals: buildSignals(evidence) };
    }

    const series = weeklySeries(inAoi, mode, meta, config);
    const baseline = buildBaseline(series, config);
    const states = classify(series, baseline, config);
    renderTriage({
      container: triageEl, map: map, signals: cache.signals, evidence: cache.evidence, config: config,
      onChange: function (t) { if (alerts) alerts.setMinStrength(t); }
    });
    renderCalendar(calendarEl, series, states, config);
    alerts = renderAlerts({
      container: alertsEl, countEl: countEl, series: series, states: states, baseline: baseline,
      signals: cache.signals, minStrength: getMinStrength(), config: config, meta: meta, onSelect: function () {}
    });
  }

  map = initMap(config, function (newAoi) { aoi = newAoi; update(); });
  drawDataLayer(map, cells, config);                 // shows where the NASA data is
  enablePicker({ map: map, cells: cells, config: config, container: document.getElementById("aoi-actions") });
  renderReport(document.getElementById("report"), validation, meta, config);
  update();
}
