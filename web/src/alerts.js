// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Alert cards (right column). Every Alarm episode becomes one card: evidence, a rule-generated
// analysis and suggested checks. A human decides. This is a HISTORICAL analysis: nothing is sent anywhere.
// The text is built from numbers with fixed rules. No AI model writes it.
import { alarmRuns } from "./alarm_logic.js";
import { el, fmt, weekLabel, monthName, median, idxToYearWeek } from "./ui.js";

const CARDS_SHOWN_AT_FIRST = 8;

function pad4(n) { return String(n).padStart(4, "0"); }

// Median of the same week in the OTHER years (the "typical" week).
function typicalWeek(series, year, week) {
  const values = [];
  Object.keys(series).forEach(function (y) {
    if (Number(y) === year) return;
    const c = series[y][week];
    if (c && c.q !== "B" && Number.isFinite(c.value)) values.push(c.value);
  });
  return values.length > 0 ? median(values) : null;
}

// Numbers for one alarm run (peak, limit, typical week, share of converted weeks...).
function describe(run, ctx) {
  const W = ctx.config.time.weeks_per_year;
  let peak = -Infinity, peakYear = run.startYear, peakWeek = run.startWeek, total = 0, converted = 0;
  for (let idx = run.startIdx; idx <= run.endIdx; idx++) {
    const yw = idxToYearWeek(idx, W);
    const c = ctx.states[yw.year] && ctx.states[yw.year][yw.week];
    if (!c) continue;
    total += c.value;
    if (c.q === "U") converted++;
    if (c.value > peak) { peak = c.value; peakYear = yw.year; peakWeek = yw.week; }
  }
  const base = ctx.baseline[peakYear] && ctx.baseline[peakYear][peakWeek];
  return {
    run: run, peak: peak, peakYear: peakYear, peakWeek: peakWeek, peakCell: ctx.states[peakYear][peakWeek],
    total: total, weeks: run.weeks, convertedShare: converted / run.weeks,
    limit: base ? base.alarm : null,
    typical: typicalWeek(ctx.series, peakYear, peakWeek),
    critical: run.weeks >= ctx.config.alarm.critical_min_weeks
  };
}

function block(idText, tags, bodyText) {
  const box = el("div", null, "block");
  const head = el("div", null, "block-head");
  head.appendChild(el("span", idText, "block-id"));
  tags.forEach(function (t) { head.appendChild(el("span", t, "tag")); });
  box.appendChild(head);
  box.appendChild(el("p", bodyText, "block-text"));
  return box;
}

function evidenceText(ep, ctx) {
  const a = ctx.config.alarm;
  let text = "Weekly total reached " + fmt(ep.peak) + " detections in " + weekLabel(ep.peakYear, ep.peakWeek);
  if (ep.limit !== null) {
    text += ", at or above the " + a.states[2] + " limit of " + fmt(ep.limit) + " for this week of the year (the " +
      a.alarm_percentile + "th percentile of the other years)";
  }
  return text + ". " + ep.weeks + " week(s) in a row at the " + a.states[2] + " state.";
}

function analysisText(ep, ctx) {
  const alarmName = ctx.config.alarm.states[2];
  const r = ep.run;
  let text = "Burning activity in the selected area stayed at the " + alarmName + " level from " +
    weekLabel(r.startYear, r.startWeek) + " to " + weekLabel(r.endYear, r.endWeek) +
    ", peaking at " + fmt(ep.peak) + " detections per week in " + weekLabel(ep.peakYear, ep.peakWeek) + ".";
  if (ep.typical !== null && ep.typical > 0) {
    text += " That is " + fmt(ep.peak / ep.typical) + " times the typical week " + ep.peakWeek + " (" +
      monthName(ep.peakWeek) + ") in the other years (median " + fmt(ep.typical) + ")";
    text += ep.limit ? " and " + fmt(ep.peak / ep.limit) + " times the " + alarmName + " limit." : ".";
  }
  text += " It ranks #" + ep.rank + " of " + ctx.totalEpisodes + " alarm episode(s) in this area by peak.";
  if (ep.convertedShare === 0) {
    text += " All of these weeks are measured by the new sensor (VIIRS).";
  } else {
    text += " " + Math.round(ep.convertedShare * 100) + "% of these weeks are converted from the legacy sensor (MODIS), so they are estimates";
    if (ep.peakCell.q === "U") text += " (at the peak: " + fmt(ep.peakCell.low) + " to " + fmt(ep.peakCell.high) + ")";
    text += ".";
  }
  return text;
}

function checksList(ep, ctx) {
  const r = ep.run;
  const checks = [
    "Compare with local fire-agency or ground reports for " + weekLabel(r.startYear, r.startWeek) + " to " + weekLabel(r.endYear, r.endWeek) + ".",
    "Select a neighbouring area on the map: are the same weeks high there too (a regional event) or only here?"
  ];
  if (ep.convertedShare > 0) checks.push("Use the low to high range for the converted (hatched) weeks, not the single value.");
  if (!ep.critical) checks.push("This episode is shorter than " + ctx.config.alarm.critical_min_weeks + " weeks: check whether it is a short burn or a data artefact.");
  const box = el("div", null, "checks");
  box.appendChild(el("div", "Suggested checks (a human decides)", "checks-title"));
  const list = el("ol");
  checks.forEach(function (c) { list.appendChild(el("li", c)); });
  box.appendChild(list);
  return box;
}

function buildCard(ep, ctx, onPick) {
  const r = ep.run;
  const card = el("details", null, "alert-card " + (ep.critical ? "sev-critical" : "sev-alarm"));
  const summary = el("summary", null, "alert-summary");

  const top = el("div", null, "alert-top");
  top.appendChild(el("span", ep.critical ? "CRITICAL" : "ALARM", "sev-badge"));
  top.appendChild(el("span", "A-" + pad4(ep.number), "alert-id"));
  const start = weekLabel(r.startYear, r.startWeek), end = weekLabel(r.endYear, r.endWeek);
  top.appendChild(el("span", start === end ? start : start + " to " + end, "alert-time"));
  summary.appendChild(top);
  summary.appendChild(el("div", ep.critical ? "Sustained alarm-level burning activity" : "Short alarm-level burning activity", "alert-title"));
  summary.appendChild(el("div", ep.weeks + " week(s) | peak " + fmt(ep.peak) + " detections/week", "alert-sub"));
  card.appendChild(summary);

  const body = el("div", null, "alert-body");
  body.appendChild(block("EV-" + pad4(ep.number), ["Alarm limit", "rule-based"], evidenceText(ep, ctx)));

  const analysis = block("Analysis", ["rule-generated"], analysisText(ep, ctx));
  const measuredPct = Math.round((1 - ep.convertedShare) * 100);
  const row = el("div", null, "bar-row");
  row.appendChild(el("span", "Measured weeks (VIIRS)"));
  row.appendChild(el("span", measuredPct + "%", "bar-value"));
  analysis.appendChild(row);
  const bar = el("div", null, "bar");
  const fill = el("div", null, "bar-fill");
  fill.style.width = measuredPct + "%";
  bar.appendChild(fill);
  analysis.appendChild(bar);
  body.appendChild(analysis);

  body.appendChild(checksList(ep, ctx));
  card.appendChild(body);

  summary.addEventListener("click", function () { onPick(ep, card); });
  return card;
}

// options = { container, countEl, series, states, baseline, config, meta, onSelect }
export function render(options) {
  const container = options.container, config = options.config;
  container.textContent = "";
  if (options.countEl) options.countEl.textContent = "";

  const ctx = { series: options.series, states: options.states, baseline: options.baseline, config: config };
  const episodes = alarmRuns(options.states, config).map(function (run, i) {
    const ep = describe(run, ctx);
    ep.number = i + 1;                                   // A-0001 is the oldest
    return ep;
  });
  ctx.totalEpisodes = episodes.length;
  const byPeak = episodes.slice().sort(function (a, b) { return b.peak - a.peak; });
  episodes.forEach(function (ep) { ep.rank = byPeak.indexOf(ep) + 1; });

  container.appendChild(el("p", "Human decision only: PyroHistorian never sends commands to anyone. " +
    "Historical record: a state means unusual compared with this area's own history, not a live alert.", "notice"));

  // Summary chips
  let elevatedWeeks = 0, totalWeeks = 0;
  Object.keys(options.states).forEach(function (y) {
    Object.keys(options.states[y]).forEach(function (w) {
      totalWeeks++;
      if (options.states[y][w].state === config.alarm.states[1]) elevatedWeeks++;
    });
  });
  const critical = episodes.filter(function (e) { return e.critical; }).length;
  const chips = el("div", null, "chips");
  chips.appendChild(el("span", critical + " critical", "chip chip-critical"));
  chips.appendChild(el("span", (episodes.length - critical) + " short alarm", "chip"));
  chips.appendChild(el("span", elevatedWeeks + " of " + totalWeeks + " weeks " + config.alarm.states[1], "chip"));
  container.appendChild(chips);

  if (options.countEl) options.countEl.textContent = String(episodes.length);

  if (episodes.length === 0) {
    container.appendChild(el("p", "No alarm in this area: the weekly totals stayed below the " + config.alarm.states[2] +
      " limit (or below the minimum of " + config.alarm.min_abs_weekly_count + " detections per week).", "empty"));
    return;
  }

  // Cards, newest first
  const newestFirst = episodes.slice().reverse();
  const list = el("div", null, "alert-list");
  container.appendChild(list);
  let shown = CARDS_SHOWN_AT_FIRST, selected = null;

  function pick(ep, card) {
    const all = list.querySelectorAll(".alert-card");
    Array.prototype.forEach.call(all, function (c) { c.classList.remove("selected"); });
    card.classList.add("selected");
    selected = ep.number;
    if (options.onSelect) options.onSelect(ep);
  }

  function draw() {
    list.textContent = "";
    newestFirst.slice(0, shown).forEach(function (ep, i) {
      const card = buildCard(ep, ctx, pick);
      if (i === 0 && selected === null) card.open = true;
      if (ep.number === selected) card.classList.add("selected");
      list.appendChild(card);
    });
    if (newestFirst.length > shown) {
      const more = el("button", "Show all " + newestFirst.length + " alerts", "more-btn");
      more.onclick = function () { shown = newestFirst.length; draw(); };
      list.appendChild(more);
    }
  }
  draw();
}
