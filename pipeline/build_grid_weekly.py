# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Turn the detections table into the WEEKLY table (one row per region, cell, year, week).
Columns: region_id, cell_id, lat, lon, year, week, legacy, new
NaN = the whole week is NOT inside that sensor's coverage.
A row that is absent = zero detections (inside coverage)."""

import math

import numpy as np
import pandas as pd

try:
    from pipeline.common import load_config
except ImportError:  # when run as: python3 pipeline/build_grid_weekly.py
    from common import load_config


def _check_week_rule(config):
    """The week is computed with (day_of_year - 1) // 7 + 1, capped at weeks_per_year.
    We cannot run text from the config as code, so we check that the rule text is the one we implement."""
    weeks = config["time"]["weeks_per_year"]
    expected = f"week = min({weeks}, (day_of_year - 1) // 7 + 1)"
    if config["time"]["week_rule"] != expected:
        raise ValueError("config.time.week_rule is not the rule implemented in build_grid_weekly.py.\n"
                         "  config:   " + config["time"]["week_rule"] + "\n"
                         "  expected: " + expected)
    return weeks


def _week_bounds(years, weeks, weeks_per_year):
    """First and last day of each (year, week). The last week of the year runs until Dec 31."""
    start = pd.to_datetime(years.astype(str) + "-01-01") + pd.to_timedelta((weeks - 1) * 7, unit="D")
    end = start + pd.Timedelta(days=6)
    year_end = pd.to_datetime(years.astype(str) + "-12-31")
    return start, end.where(weeks != weeks_per_year, year_end)


def _inside_coverage(start, end, cov):
    """True when the WHOLE week is inside the sensor's coverage."""
    if not cov or cov.get("start") is None:
        return pd.Series(False, index=start.index)
    return (start >= pd.Timestamp(cov["start"])) & (end <= pd.Timestamp(cov["end"]))


def build(detections, coverage, config=None):
    """detections table + coverage dict -> weekly table."""
    config = config or load_config()
    step = config["grid"]["step_deg"]
    weeks_per_year = _check_week_rule(config)
    # sensor name in the data -> "legacy" / "new"
    names = {config["sensors"]["legacy"]["name"]: "legacy",
             config["sensors"]["new"]["name"]: "new"}

    pieces = []
    for region in config["regions"]:
        box = region["bbox"]
        south, west, north, east = box["south"], box["west"], box["north"], box["east"]
        n_rows = max(1, math.ceil((north - south) / step - 1e-9))
        n_cols = max(1, math.ceil((east - west) / step - 1e-9))

        inside = detections["lat"].between(south, north) & detections["lon"].between(west, east)
        d = detections[inside]
        if d.empty:
            print(f"[grid] WARNING: no detections inside region {region['id']}")
            continue

        # Grid cell of each detection (index counted from the south-west corner).
        row = np.minimum(np.floor((d["lat"].to_numpy() - south) / step).astype(int), n_rows - 1)
        col = np.minimum(np.floor((d["lon"].to_numpy() - west) / step).astype(int), n_cols - 1)
        # Year and week of each detection.
        doy = d["date"].dt.dayofyear.to_numpy()
        week = np.minimum(weeks_per_year, (doy - 1) // 7 + 1)

        work = pd.DataFrame({
            "row": row, "col": col,
            "year": d["date"].dt.year.to_numpy(),
            "week": week,
            "key": d["sensor"].map(names).to_numpy(),
        }).dropna(subset=["key"])

        # Count detections per cell-week and sensor.
        counts = work.groupby(["row", "col", "year", "week", "key"]).size().unstack("key", fill_value=0)
        counts = counts.reindex(columns=["legacy", "new"], fill_value=0).reset_index()
        counts.columns.name = None

        # A week that is not fully inside a sensor's coverage becomes NaN for that sensor.
        start, end = _week_bounds(counts["year"], counts["week"], weeks_per_year)
        for key in ("legacy", "new"):
            ok = _inside_coverage(start, end, coverage.get(key))
            counts[key] = counts[key].astype(float).where(ok)

        # Keep only rows with at least one detection (NaN > 0 is False).
        counts = counts[(counts["legacy"] > 0) | (counts["new"] > 0)].copy()

        counts["region_id"] = region["id"]
        counts["cell_id"] = region["id"] + "_" + counts["row"].astype(str) + "_" + counts["col"].astype(str)
        counts["lat"] = (south + (counts["row"] + 0.5) * step).round(6)   # cell centre
        counts["lon"] = (west + (counts["col"] + 0.5) * step).round(6)
        pieces.append(counts[["region_id", "cell_id", "lat", "lon", "year", "week", "legacy", "new"]])
        print(f"[grid] region {region['id']}: {n_rows} x {n_cols} cells of {step} degrees, "
              f"{len(counts):,} cell-week rows")

    columns = ["region_id", "cell_id", "lat", "lon", "year", "week", "legacy", "new"]
    if not pieces:
        return pd.DataFrame(columns=columns)
    weekly = pd.concat(pieces, ignore_index=True)
    weekly = weekly.sort_values(["region_id", "cell_id", "year", "week"]).reset_index(drop=True)

    print("[grid] weekly rows:", f"{len(weekly):,}", "| cells with data:", weekly["cell_id"].nunique())
    print("[grid] rows with a legacy value:", f"{int(weekly['legacy'].notna().sum()):,}",
          "| with a new value:", f"{int(weekly['new'].notna().sum()):,}")
    return weekly
