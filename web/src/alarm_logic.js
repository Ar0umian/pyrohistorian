// AI disclosure: written with help from Claude (Anthropic); reviewed by Owner B.
// Seasonal baseline + hysteresis on the WEEKLY aggregate (never on raw detections).

// TODO(verify): not in config. Minimum number of other years needed to build a baseline.
const MIN_BASELINE_VALUES = 3;

// Percentile with linear interpolation. p is 0-100.
function percentile(sorted, p) {
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Sorted list of {year, week, idx, cell}, skipping missing weeks.
function flatten(table, W) {
  const out = [];
  Object.keys(table).forEach(function (y) {
    Object.keys(table[y]).forEach(function (w) {
      const cell = table[y][w];
      if (cell.q === "B" || !Number.isFinite(cell.value)) return;
      out.push({ year: Number(y), week: Number(w), idx: Number(y) * W + Number(w) - 1, cell: cell });
    });
  });
  return out.sort(function (a, b) { return a.idx - b.idx; });
}

// baseline[year][week] = { elevated, alarm }, built from the OTHER years only.
export function buildBaseline(series, config) {
  const a = config.alarm, W = config.time.weeks_per_year;
  const years = Object.keys(series);
  const baseline = {};
  years.forEach(function (year) {
    baseline[year] = {};
    for (let w = 1; w <= W; w++) {
      const vals = [];
      years.forEach(function (other) {
        if (other === year) return;                    // exclude the evaluated year
        const c = series[other][w];
        if (c && c.q !== "B" && Number.isFinite(c.value)) vals.push(c.value);
      });
      if (vals.length < MIN_BASELINE_VALUES) continue;
      vals.sort(function (x, y) { return x - y; });
      baseline[year][w] = { elevated: percentile(vals, a.elevated_percentile), alarm: percentile(vals, a.alarm_percentile) };
    }
  });
  return baseline;
}

// states[year][week] = { value, low, high, q, state }. Hysteresis: a new level must hold
// for hysteresis_weeks in a row before the state changes.
export function classify(series, baseline, config) {
  const a = config.alarm, W = config.time.weeks_per_year;
  const states = {};
  let current = a.states[0], pending = null, count = 0;
  flatten(series, W).forEach(function (item) {
    const b = baseline[item.year] && baseline[item.year][item.week];
    let raw = a.states[0];
    if (b && item.cell.value >= a.min_abs_weekly_count) {
      if (item.cell.value >= b.alarm) raw = a.states[2];
      else if (item.cell.value >= b.elevated) raw = a.states[1];
    }
    if (raw === current) { pending = null; count = 0; }
    else {
      if (raw === pending) count++; else { pending = raw; count = 1; }
      if (count >= a.hysteresis_weeks) { current = raw; pending = null; count = 0; }
    }
    if (!states[item.year]) states[item.year] = {};
    states[item.year][item.week] = Object.assign({}, item.cell, { state: current });
  });
  return states;
}

// All runs of consecutive Alarm weeks.
function alarmRuns(states, config) {
  const W = config.time.weeks_per_year, alarmName = config.alarm.states[2];
  const runs = [];
  let run = null;
  flatten(states, W).forEach(function (it) {
    if (it.cell.state === alarmName) {
      if (run && it.idx === run.endIdx + 1) { run.endIdx = it.idx; run.endYear = it.year; run.endWeek = it.week; run.weeks++; }
      else {
        run = { startIdx: it.idx, endIdx: it.idx, startYear: it.year, startWeek: it.week, endYear: it.year, endWeek: it.week, weeks: 1 };
        runs.push(run);
      }
    } else { run = null; }
  });
  return runs;
}

// Alarm runs lasting at least critical_min_weeks.
export function findCriticalPeriods(states, config) {
  return alarmRuns(states, config).filter(function (r) { return r.weeks >= config.alarm.critical_min_weeks; });
}

// KPIs. "Chattering" here = an Alarm that restarts after a gap shorter than critical_min_weeks.
export function alarmKpis(states, periods, config) {
  const runs = alarmRuns(states, config);
  const perYear = {};
  let longest = 0, chatter = 0;
  runs.forEach(function (r, i) {
    perYear[r.startYear] = (perYear[r.startYear] || 0) + 1;
    if (r.weeks > longest) longest = r.weeks;
    if (i > 0 && r.startIdx - runs[i - 1].endIdx - 1 < config.alarm.critical_min_weeks) chatter++;
  });
  return { alarmsPerYear: perYear, longestAlarmWeeks: longest, chatteringCount: chatter, criticalPeriods: periods.length };
}