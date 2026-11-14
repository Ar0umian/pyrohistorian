// AI disclosure: written with help from Claude (Anthropic); updated for contract version 2; must be reviewed by the team.
// Sums cells per year/week. It follows docs/DATA_CONTRACT.md:
//  - cell.data keys are "YYYY_WW" with TWO digits for the week (for example "2015_05")
//  - every value is a list in the order of config.schema.cells_weekly.value_fields
//  - meta.coverage.legacy / .new = { start: "YYYY-MM-DD", end: "YYYY-MM-DD" | null }
//  - a week is inside a sensor's coverage only if the WHOLE week is inside (same rule as the pipeline)

function dayOfYear(y, m, d) {
  return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000 + 1;
}

function parseDate(dateStr) {
  return dateStr.split("-").map(Number);
}

// config.time.week_rule: week = min(W, (day_of_year - 1) // 7 + 1)
function weekOf(doy, W) {
  return Math.min(W, Math.floor((doy - 1) / 7) + 1);
}

// Index of the FIRST week fully inside a coverage that starts on dateStr.
function firstFullWeek(dateStr, W) {
  const p = parseDate(dateStr);
  const doy = dayOfYear(p[0], p[1], p[2]);
  const week = weekOf(doy, W);
  const idx = p[0] * W + (week - 1);
  const weekFirstDay = (week - 1) * 7 + 1;
  return doy > weekFirstDay ? idx + 1 : idx;        // the start is in the middle of a week: take the next one
}

// Index of the LAST week fully inside a coverage that ends on dateStr.
function lastFullWeek(dateStr, W) {
  const p = parseDate(dateStr);
  const doy = dayOfYear(p[0], p[1], p[2]);
  const week = weekOf(doy, W);
  const idx = p[0] * W + (week - 1);
  const weekLastDay = week === W ? dayOfYear(p[0], 12, 31) : week * 7;   // the last week runs to Dec 31
  return doy < weekLastDay ? idx - 1 : idx;         // the end is in the middle of a week: take the previous one
}

function makeRange(cov, W) {
  return {
    start: cov && cov.start ? firstFullWeek(cov.start, W) : -Infinity,
    end: cov && cov.end ? lastFullWeek(cov.end, W) : Infinity   // null end = still operating
  };
}

function weekKey(year, week) {
  return year + "_" + (week < 10 ? "0" + week : String(week));
}

// cells: cells in the AOI. mode: "legacy_only" | "harmonized". Returns series[year][week] = {value, low, high, q}.
export function weeklySeries(cells, mode, meta, config) {
  const W = config.time.weeks_per_year;
  const legacyRange = makeRange(meta.coverage.legacy, W);
  const newRange = makeRange(meta.coverage.new, W);
  const inR = function (r, idx) { return idx >= r.start && idx <= r.end; };

  // Position of each field inside a week's list.
  const pos = {};
  config.schema.cells_weekly.value_fields.forEach(function (name, i) { pos[name] = i; });
  const get = function (rec, name) { return rec[pos[name]]; };

  const series = {};
  for (let year = config.time.first_year; year <= config.time.last_year; year++) {
    for (let week = 1; week <= W; week++) {
      const idx = year * W + (week - 1);
      const key = weekKey(year, week);
      let value = 0, low = 0, high = 0, counted = 0, anyU = false;

      cells.forEach(function (cell) {
        const rec = cell.data[key];
        if (mode === "legacy_only") {
          if (rec) {                                   // row present
            const legacy = get(rec, "legacy");
            if (Number.isFinite(legacy)) { value += legacy; counted++; }
          } else if (inR(legacyRange, idx)) {          // absent but inside coverage = zero
            counted++;
          }                                            // else: missing
        } else {
          if (rec) {
            const harmonized = get(rec, "harmonized");
            if (Number.isFinite(harmonized)) {
              const l = get(rec, "low"), h = get(rec, "high");
              value += harmonized;
              low += Number.isFinite(l) ? l : harmonized;
              high += Number.isFinite(h) ? h : harmonized;
              if (get(rec, "q") === "U") anyU = true;
              counted++;
            }
          } else if (inR(newRange, idx)) {             // absent inside new-sensor coverage: zero, measured
            counted++;
          } else if (inR(legacyRange, idx)) {          // absent inside legacy coverage only: zero, converted
            anyU = true; counted++;
          }
        }
      });

      if (counted === 0) continue;                     // week stays absent = missing
      if (mode === "legacy_only") { low = value; high = value; }
      if (!series[year]) series[year] = {};
      series[year][week] = { value: value, low: low, high: high, q: anyU ? "U" : "G" };
    }
  }
  return series;
}

// Coverage of both sensors as week-index ranges {start, end} (only WHOLE weeks count, like in the pipeline).
// Used by referee.js to know which weeks both sensors were watching.
export function coverageRanges(meta, config) {
  const W = config.time.weeks_per_year;
  return { legacy: makeRange(meta.coverage.legacy, W), new: makeRange(meta.coverage.new, W) };
}
