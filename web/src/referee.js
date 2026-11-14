// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// SENSOR REFEREE: decides which alarms deserve action, using evidence from BOTH sensors.
//  - VIIRS (new, 375 m) is very sensitive: it picks up the faintest signals, so it raises many alarms.
//  - MODIS (legacy, 1 km) is less sensitive: when it ALSO sees the same cell in the same week,
//    the signal is more credible.
// Everything comes from the data (cells_weekly.json). There is NO ground truth here, so
// "confirmation" is indirect evidence, not accuracy. Pure logic: nothing is drawn in this file.
import { coverageRanges } from "./aggregate.js";

// TODO(verify): not in config. A VIIRS signal with at most this many detections in one cell-week is "faint".
const FAINT_MAX = 2;
// TODO(verify): not in config. Starting values of the policy (the sliders change them).
const DEFAULT_MIN_CONFIRM = 0.25;   // share of VIIRS-active cells that MODIS must also see
const DEFAULT_MIN_CELLS = 3;        // active VIIRS cells in the peak week

// Signal strength groups: detections of VIIRS in one cell-week.
const STRENGTH_BINS = [
  { label: "1", min: 1, max: 1 },
  { label: "2", min: 2, max: 2 },
  { label: "3-5", min: 3, max: 5 },
  { label: "6-10", min: 6, max: 10 },
  { label: ">10", min: 11, max: Infinity }
];

function inR(range, idx) { return idx >= range.start && idx <= range.end; }

// Same month rule as the pipeline: the middle of the week in a normal year.
function monthOfWeek(week) {
  return new Date(Date.UTC(2001, 0, 1 + (week - 1) * 7 + 3)).getUTCMonth() + 1;
}

// For every week with any detection: which cells were active, and which sensor saw them.
// cells = the cells inside the area, as in cells_weekly.json.
export function buildEvidence(cells, meta, config) {
  const W = config.time.weeks_per_year;
  const step = config.grid.step_deg;
  const box = config.regions[0].bbox;
  const ranges = coverageRanges(meta, config);
  const pos = {};
  config.schema.cells_weekly.value_fields.forEach(function (name, i) { pos[name] = i; });

  const byIdx = new Map();
  cells.forEach(function (cell) {
    // Row and column of the cell on the grid (to find its neighbours).
    const r = Math.round((cell.lat - box.south) / step - 0.5);
    const c = Math.round((cell.lon - box.west) / step - 0.5);
    Object.keys(cell.data).forEach(function (key) {
      const rec = cell.data[key];
      const legacy = Number.isFinite(rec[pos.legacy]) ? rec[pos.legacy] : 0;
      const viirs = Number.isFinite(rec[pos["new"]]) ? rec[pos["new"]] : 0;
      if (legacy <= 0 && viirs <= 0) return;
      const year = Number(key.slice(0, 4)), week = Number(key.slice(5, 7));
      const idx = year * W + week - 1;
      let ev = byIdx.get(idx);
      if (!ev) {
        ev = { idx: idx, year: year, week: week, overlap: inR(ranges.legacy, idx) && inR(ranges["new"], idx),
               cells: [], nViirs: 0, nModis: 0, nBoth: 0, nFaint: 0, viirsTotal: 0, modisTotal: 0, nClustered: 0 };
        byIdx.set(idx, ev);
      }
      ev.cells.push({ r: r, c: c, lat: cell.lat, lon: cell.lon, legacy: legacy, nw: viirs });
      if (viirs > 0) { ev.nViirs++; ev.viirsTotal += viirs; if (viirs <= FAINT_MAX) ev.nFaint++; }
      if (legacy > 0) { ev.nModis++; ev.modisTotal += legacy; }
      if (viirs > 0 && legacy > 0) ev.nBoth++;
    });
  });

  // Clustering: how many VIIRS-active cells touch another VIIRS-active cell (8 neighbours).
  byIdx.forEach(function (ev) {
    const active = new Set();
    ev.cells.forEach(function (x) { if (x.nw > 0) active.add(x.r + "," + x.c); });
    ev.cells.forEach(function (x) {
      if (!(x.nw > 0)) return;
      let touches = false;
      for (let dr = -1; dr <= 1 && !touches; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dr !== 0 || dc !== 0) && active.has((x.r + dr) + "," + (x.c + dc))) { touches = true; break; }
        }
      }
      if (touches) ev.nClustered++;
    });
  });
  return { byIdx: byIdx, ranges: ranges };
}

// The three pieces of evidence for one alarm run (see alarm_logic.js alarmRuns).
export function episodeMetrics(run, evidence) {
  let viirsCellWeeks = 0, confirmed = 0, faint = 0, overlapWeeks = 0;
  let peakCells = 0, peakClustered = 0, peakIdx = run.startIdx;
  let viirsTotal = 0, modisTotal = 0;
  for (let idx = run.startIdx; idx <= run.endIdx; idx++) {
    const inOverlap = inR(evidence.ranges.legacy, idx) && inR(evidence.ranges["new"], idx);
    if (inOverlap) overlapWeeks++;
    const ev = evidence.byIdx.get(idx);
    if (!ev) continue;
    viirsTotal += ev.viirsTotal;
    modisTotal += ev.modisTotal;
    if (ev.nViirs > peakCells) { peakCells = ev.nViirs; peakClustered = ev.nClustered; peakIdx = idx; }
    if (inOverlap) { viirsCellWeeks += ev.nViirs; confirmed += ev.nBoth; faint += ev.nFaint; }
  }
  return {
    weeks: run.weeks,
    overlapWeeks: overlapWeeks,
    crossCheck: overlapWeeks > 0 && viirsCellWeeks > 0,                 // both sensors watched this alarm
    confirmation: viirsCellWeeks > 0 ? confirmed / viirsCellWeeks : null,   // share of VIIRS cells that MODIS also saw
    faintShare: viirsCellWeeks > 0 ? faint / viirsCellWeeks : null,         // share of faint VIIRS signals
    peakCells: peakCells,
    peakClusteredShare: peakCells > 0 ? peakClustered / peakCells : null,
    peakIdx: peakIdx,
    viirsTotal: viirsTotal,
    modisTotal: modisTotal
  };
}

export function defaultPolicy(config) {
  return { minConfirm: DEFAULT_MIN_CONFIRM, minWeeks: config.alarm.critical_min_weeks, minCells: DEFAULT_MIN_CELLS };
}

function pct(x) { return Math.round(x * 100) + "%"; }

// Verdict for one alarm.
//  ESCALATE: the second sensor confirms AND (it lasts OR it spreads)
//  WATCH:    only one of the three pieces of evidence holds
//  HOLD:     none of them holds (likely a faint single-sensor signal)
//  SINGLE:   only one sensor was watching (before VIIRS): it cannot be cross-checked
export function judge(m, policy) {
  if (!m.crossCheck) {
    return { verdict: "SINGLE", reasons: [{ ok: null, text: "Only one sensor (MODIS) was watching in these weeks, so the alarm cannot be cross-checked." }] };
  }
  const confirmOK = m.confirmation >= policy.minConfirm;
  const persistOK = m.weeks >= policy.minWeeks;
  const spreadOK = m.peakCells >= policy.minCells;

  let verdict = "HOLD";
  if (confirmOK && (persistOK || spreadOK)) verdict = "ESCALATE";
  else if (confirmOK || persistOK || spreadOK) verdict = "WATCH";

  const reasons = [
    { ok: confirmOK, text: "MODIS also saw " + pct(m.confirmation) + " of the cells that VIIRS flagged (needs " + pct(policy.minConfirm) + ")." },
    { ok: persistOK, text: "It lasted " + m.weeks + " week(s) (needs " + policy.minWeeks + ")." },
    { ok: spreadOK, text: "In the peak week " + m.peakCells + " cells were active" +
        (m.peakClusteredShare !== null ? ", " + pct(m.peakClusteredShare) + " of them touching another active cell" : "") +
        " (needs " + policy.minCells + ")." }
  ];
  if (m.faintShare !== null && m.faintShare >= 0.5) {
    reasons.push({ ok: null, text: pct(m.faintShare) + " of the VIIRS signals were faint (" + FAINT_MAX + " detections or fewer in a cell-week)." });
  }
  return { verdict: verdict, reasons: reasons };
}

// Judge every alarm run. runs = alarmRuns(states, config) (oldest first). Fast enough to rerun on every slider move.
export function triage(runs, evidence, policy) {
  const episodes = runs.map(function (run, i) {
    const metrics = episodeMetrics(run, evidence);
    const j = judge(metrics, policy);
    return { number: i + 1, run: run, metrics: metrics, verdict: j.verdict, reasons: j.reasons };
  });
  const counts = { ESCALATE: 0, WATCH: 0, HOLD: 0, SINGLE: 0 };
  episodes.forEach(function (e) { counts[e.verdict]++; });
  return { episodes: episodes, counts: counts };
}

// How much can VIIRS be trusted alone? Share of VIIRS-active cell-weeks that MODIS also saw,
// by month and by signal strength. Only weeks watched by both sensors count.
export function sensorProfile(evidence) {
  const byMonth = [];
  for (let m = 1; m <= 12; m++) byMonth.push({ month: m, cellWeeks: 0, confirmed: 0, rate: null });
  const byStrength = STRENGTH_BINS.map(function (b) { return { label: b.label, cellWeeks: 0, confirmed: 0, rate: null }; });

  evidence.byIdx.forEach(function (ev) {
    if (!ev.overlap) return;
    const month = byMonth[monthOfWeek(ev.week) - 1];
    ev.cells.forEach(function (x) {
      if (!(x.nw > 0)) return;
      const both = x.legacy > 0;
      month.cellWeeks++;
      if (both) month.confirmed++;
      for (let i = 0; i < STRENGTH_BINS.length; i++) {
        if (x.nw >= STRENGTH_BINS[i].min && x.nw <= STRENGTH_BINS[i].max) {
          byStrength[i].cellWeeks++;
          if (both) byStrength[i].confirmed++;
          break;
        }
      }
    });
  });
  byMonth.concat(byStrength).forEach(function (g) { g.rate = g.cellWeeks > 0 ? g.confirmed / g.cellWeeks : null; });
  return { byMonth: byMonth, byStrength: byStrength };
}

// ======================================================================
// SIGNAL TRIAGE (cell level). The noise of a very sensitive sensor lives in the small signals:
// a VIIRS cell-week with 1 or 2 detections. Every VIIRS-active cell-week in a week watched by BOTH
// sensors is a "signal". The rule uses VIIRS-only features (strength, active neighbours, continuity in time).
// MODIS is used only as an independent check (did MODIS also see that cell in that week?), so the
// check is not circular. CAUTION: "not confirmed" does not mean "false": a real small fire can be
// below the detection limit of MODIS.
// ======================================================================

const CURVE_STRENGTHS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30];

// All signals of the area. evidence = buildEvidence(...)
export function buildSignals(evidence) {
  // Which cell was VIIRS-active in which week (to look at the week before and after).
  const active = new Set();
  evidence.byIdx.forEach(function (ev) {
    ev.cells.forEach(function (x) { if (x.nw > 0) active.add(x.r + "," + x.c + "," + ev.idx); });
  });

  const signals = [];
  evidence.byIdx.forEach(function (ev) {
    if (!ev.overlap) return;                       // both sensors must be watching
    const sameWeek = new Set();
    ev.cells.forEach(function (x) { if (x.nw > 0) sameWeek.add(x.r + "," + x.c); });
    ev.cells.forEach(function (x) {
      if (!(x.nw > 0)) return;
      let neighbours = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dr !== 0 || dc !== 0) && sameWeek.has((x.r + dr) + "," + (x.c + dc))) neighbours++;
        }
      }
      const persistent = active.has(x.r + "," + x.c + "," + (ev.idx - 1)) || active.has(x.r + "," + x.c + "," + (ev.idx + 1));
      signals.push({ idx: ev.idx, year: ev.year, week: ev.week, r: x.r, c: x.c, lat: x.lat, lon: x.lon,
                     nw: x.nw, legacy: x.legacy, confirmed: x.legacy > 0, nb: neighbours, persist: persistent });
    });
  });
  return signals;
}

// minStrength: detections per cell-week needed to be "serious".
// minNeighbours: active neighbour cells that also make a signal serious (0 = this rule is off).
// keepPersistent: a signal that continues from the week before or after is also serious.
export function defaultSignalPolicy() {
  return { minStrength: 3, minNeighbours: 0, keepPersistent: false };
}

export function isSerious(signal, policy) {
  if (signal.nw >= policy.minStrength) return true;
  if (policy.minNeighbours > 0 && signal.nb >= policy.minNeighbours) return true;
  if (policy.keepPersistent && signal.persist) return true;
  return false;
}

// What a policy does: how many signals are kept, and what MODIS says about the kept and the dropped ones.
export function evaluate(signals, policy) {
  let kept = 0, keptConfirmed = 0, totalConfirmed = 0;
  signals.forEach(function (s) {
    if (s.confirmed) totalConfirmed++;
    if (isSerious(s, policy)) { kept++; if (s.confirmed) keptConfirmed++; }
  });
  const total = signals.length, dropped = total - kept, droppedConfirmed = totalConfirmed - keptConfirmed;
  return {
    total: total, kept: kept, dropped: dropped,
    totalConfirmed: totalConfirmed, keptConfirmed: keptConfirmed, droppedConfirmed: droppedConfirmed,
    loadCut: total > 0 ? dropped / total : null,                              // share of signals taken off the emergency list
    keptConfirmShare: kept > 0 ? keptConfirmed / kept : null,                  // of the kept: share MODIS also saw
    retained: totalConfirmed > 0 ? keptConfirmed / totalConfirmed : null,      // of all MODIS-confirmed: share we still keep
    droppedConfirmShare: dropped > 0 ? droppedConfirmed / dropped : null       // of the dropped: share MODIS saw (what we risk)
  };
}

// The same policy for several strength thresholds (to draw the trade-off curve).
export function tradeoffCurve(signals, policy) {
  return CURVE_STRENGTHS.map(function (t) {
    const result = evaluate(signals, { minStrength: t, minNeighbours: policy.minNeighbours, keepPersistent: policy.keepPersistent });
    result.minStrength = t;
    return result;
  });
}

// ======================================================================
// CREDIBILITY SCORE. For a signal with given VIIRS-only features (strength group, active neighbours,
// continuity in time) the score is the share of such signals that MODIS ALSO saw, learned from the
// history of the area. It uses VIIRS features only, so after the legacy sensor stops it can still be
// computed (assumption to check: the relation stays stable over time).
// looCredibility = leave-one-year-out: a signal is scored with statistics that do NOT include its own year.
// ======================================================================

const STRENGTH_GROUPS = [[1, 1], [2, 2], [3, 3], [4, 5], [6, 10], [11, 20], [21, Infinity]];
const NEIGHBOUR_GROUPS = [[0, 0], [1, 2], [3, 5], [6, 8]];

function groupOf(groups, v) {
  for (let i = 0; i < groups.length; i++) { if (v >= groups[i][0] && v <= groups[i][1]) return i; }
  return groups.length - 1;
}

function signalKey(s, f) {
  let key = "";
  if (f.strength) key += "s" + groupOf(STRENGTH_GROUPS, s.nw);
  if (f.neighbours) key += "n" + groupOf(NEIGHBOUR_GROUPS, s.nb);
  if (f.persistence) key += "p" + (s.persist ? 1 : 0);
  return key;
}

// Small-sample smoothing, so a group with very few signals does not give 0% or 100%.
function smooth(n, c) { return (c + 1) / (n + 2); }

export const ALL_FEATURES = { strength: true, neighbours: true, persistence: true };

// table: group key -> { n: signals, c: confirmed by MODIS }
export function trainCredibility(signals, features) {
  const f = features || ALL_FEATURES;
  const table = new Map();
  signals.forEach(function (s) {
    const key = signalKey(s, f);
    const e = table.get(key) || { n: 0, c: 0 };
    e.n++;
    if (s.confirmed) e.c++;
    table.set(key, e);
  });
  return table;
}

// Score other signals with a trained table (for example later years, or years without MODIS).
export function applyCredibility(signals, table, features) {
  const f = features || ALL_FEATURES;
  return signals.map(function (s) {
    const e = table.get(signalKey(s, f));
    return e ? smooth(e.n, e.c) : 0.5;
  });
}

// Leave-one-year-out score of every signal (array in the same order as `signals`).
export function looCredibility(signals, features) {
  const f = features || ALL_FEATURES;
  const total = trainCredibility(signals, f);
  const perYear = new Map();
  signals.forEach(function (s) {
    const k = s.year + "|" + signalKey(s, f);
    const e = perYear.get(k) || { n: 0, c: 0 };
    e.n++;
    if (s.confirmed) e.c++;
    perYear.set(k, e);
  });
  return signals.map(function (s) {
    const key = signalKey(s, f);
    const t = total.get(key), y = perYear.get(s.year + "|" + key);
    return smooth(t.n - y.n, t.c - y.c);
  });
}

// Same numbers as evaluate(), for any keep rule: keepFn(signal, index) -> true if the signal stays on the emergency list.
export function evaluateBy(signals, keepFn) {
  let kept = 0, keptConfirmed = 0, totalConfirmed = 0;
  signals.forEach(function (s, i) {
    if (s.confirmed) totalConfirmed++;
    if (keepFn(s, i)) { kept++; if (s.confirmed) keptConfirmed++; }
  });
  const total = signals.length, dropped = total - kept, droppedConfirmed = totalConfirmed - keptConfirmed;
  return {
    total: total, kept: kept, dropped: dropped,
    totalConfirmed: totalConfirmed, keptConfirmed: keptConfirmed, droppedConfirmed: droppedConfirmed,
    loadCut: total > 0 ? dropped / total : null,
    keptConfirmShare: kept > 0 ? keptConfirmed / kept : null,
    retained: totalConfirmed > 0 ? keptConfirmed / totalConfirmed : null,
    droppedConfirmShare: dropped > 0 ? droppedConfirmed / dropped : null
  };
}

// How well does a score separate MODIS-confirmed signals from the others?
// 0.5 = no information, 1 = perfect. (Probability that a confirmed signal gets a higher score than an unconfirmed one.)
export function auc(signals, scores) {
  const groups = new Map();
  let positives = 0, negatives = 0;
  signals.forEach(function (s, i) {
    const g = groups.get(scores[i]) || { pos: 0, neg: 0 };
    if (s.confirmed) { g.pos++; positives++; } else { g.neg++; negatives++; }
    groups.set(scores[i], g);
  });
  if (positives === 0 || negatives === 0) return null;
  const keys = Array.from(groups.keys()).sort(function (a, b) { return a - b; });
  let negBelow = 0, sum = 0;
  keys.forEach(function (k) {
    const g = groups.get(k);
    sum += g.pos * negBelow + 0.5 * g.pos * g.neg;
    negBelow += g.neg;
  });
  return sum / (positives * negatives);
}
