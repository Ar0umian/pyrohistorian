// AI disclosure: written with help from Claude (Anthropic); reviewed by Owner B.
// Sums cells per year/week. ASSUMPTIONS (verify with Owner A):
//  - cell.data keys look like "2015_23" (config.schema.cells_weekly.data_key = "year_week")
//  - meta.coverage.legacy / .new = { start: "YYYY-MM-DD", end: "YYYY-MM-DD" | null }

// Date string -> a single number that orders weeks (uses config.time.week_rule logic).
function weekIndex(dateStr, W) {
  const p = dateStr.split("-").map(Number);
  const doy = (Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(p[0], 0, 1)) / 86400000 + 1;
  const week = Math.min(W, Math.floor((doy - 1) / 7) + 1);
  return p[0] * W + (week - 1);
}

function makeRange(cov, W) {
  return {
    start: cov && cov.start ? weekIndex(cov.start, W) : -Infinity,
    end: cov && cov.end ? weekIndex(cov.end, W) : Infinity   // null end = still operating
  };
}

// cells: cells in the AOI. mode: "legacy_only" | "harmonized". Returns series[year][week].
export function weeklySeries(cells, mode, meta, config) {
  const W = config.time.weeks_per_year;
  const legacyRange = makeRange(meta.coverage.legacy, W);
  const newRange = makeRange(meta.coverage.new, W);
  const inR = function (r, idx) { return idx >= r.start && idx <= r.end; };
  const series = {};

  for (let year = config.time.first_year; year <= config.time.last_year; year++) {
    for (let week = 1; week <= W; week++) {
      const idx = year * W + (week - 1);
      const key = year + "_" + week;
      let value = 0, low = 0, high = 0, counted = 0, anyU = false;

      cells.forEach(function (cell) {
        const rec = cell.data[key];
        if (mode === "legacy_only") {
          if (rec) {                                   // row present
            if (Number.isFinite(rec.legacy)) { value += rec.legacy; counted++; }
          } else if (inR(legacyRange, idx)) {          // absent but inside coverage = zero
            counted++;
          }                                            // else: missing
        } else {
          if (rec) {
            if (Number.isFinite(rec.harmonized)) {
              value += rec.harmonized;
              low += Number.isFinite(rec.low) ? rec.low : rec.harmonized;
              high += Number.isFinite(rec.high) ? rec.high : rec.harmonized;
              if (rec.q === "U") anyU = true;
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