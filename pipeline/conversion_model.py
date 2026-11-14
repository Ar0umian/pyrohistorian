# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Convert MODIS counts to the VIIRS scale using the overlap years.
ratio = sum(VIIRS) / sum(MODIS) per region, month and year, then the median / min / max over the years."""

import numpy as np
import pandas as pd

try:
    from pipeline.common import load_config
except ImportError:  # when run as: python3 pipeline/conversion_model.py
    from common import load_config

RATIO_COLUMNS = ["region_id", "month", "year", "legacy_sum", "new_sum", "ratio"]
SUMMARY_COLUMNS = ["region_id", "month", "median", "low", "high", "n_years"]


def week_to_month(weeks, config=None):
    """Month (1..12) of each week number. Helper also used by validation.py.
    We use the middle of the week in a normal (non-leap) year, so every year gives the same answer."""
    config = config or load_config()
    first_day = pd.Timestamp("2001-01-01")
    lookup = {w: (first_day + pd.Timedelta(days=(w - 1) * 7 + 3)).month
              for w in range(1, config["time"]["weeks_per_year"] + 1)}
    return weeks.map(lookup)


def yearly_ratio_table(weekly, config=None):
    """Per region, month, year: sum(VIIRS) / sum(MODIS) over the OVERLAP weeks.
    Overlap week = both sensors covered (no NaN), year >= overlap_start_year.
    Only kept when the MODIS total >= conversion.min_legacy_total_count."""
    config = config or load_config()
    overlap_start = config["time"]["overlap_start_year"]
    min_total = config["conversion"]["min_legacy_total_count"]

    both = weekly[weekly["legacy"].notna() & weekly["new"].notna() & (weekly["year"] >= overlap_start)].copy()
    if both.empty:
        print("[conversion] WARNING: the two sensors do not overlap in the weekly table")
        return pd.DataFrame(columns=RATIO_COLUMNS)

    both["month"] = week_to_month(both["week"], config)
    table = both.groupby(["region_id", "month", "year"], as_index=False).agg(
        legacy_sum=("legacy", "sum"), new_sum=("new", "sum"))
    before = len(table)
    table = table[table["legacy_sum"] >= min_total].copy()
    table["ratio"] = table["new_sum"] / table["legacy_sum"]
    print(f"[conversion] ratio table: {len(table)} region-month-year rows "
          f"({before - len(table)} removed: MODIS total < {min_total})")
    return table[RATIO_COLUMNS].reset_index(drop=True)


def summarize_ratios(ratio_table, exclude_year=None, config=None):
    """Median, min (low), max (high) of the ratios and number of years, per region and month.
    exclude_year: leave this year out (used by validation). Needs at least conversion.min_overlap_years years."""
    config = config or load_config()
    min_years = config["conversion"]["min_overlap_years"]

    table = ratio_table
    if exclude_year is not None:
        table = table[table["year"] != exclude_year]
    if table.empty:
        return pd.DataFrame(columns=SUMMARY_COLUMNS)

    summary = table.groupby(["region_id", "month"], as_index=False).agg(
        median=("ratio", "median"), low=("ratio", "min"),
        high=("ratio", "max"), n_years=("year", "nunique"))
    summary = summary[summary["n_years"] >= min_years]
    return summary[SUMMARY_COLUMNS].reset_index(drop=True)


def apply_conversion(weekly, ratios, config=None):
    """Adds harmonized, low, high to the weekly table:
    measured VIIRS value if present, otherwise MODIS x ratio (median, min, max).
    No ratio available for that region and month -> NaN."""
    config = config or load_config()
    final = weekly.copy()
    final["month"] = week_to_month(final["week"], config)

    if ratios.empty:
        final["r_median"] = np.nan
        final["r_low"] = np.nan
        final["r_high"] = np.nan
    else:
        r = ratios[["region_id", "month", "median", "low", "high"]].rename(
            columns={"median": "r_median", "low": "r_low", "high": "r_high"})
        final = final.merge(r, on=["region_id", "month"], how="left")

    has_new = final["new"].notna()
    final["harmonized"] = np.where(has_new, final["new"], final["legacy"] * final["r_median"])
    final["low"] = np.where(has_new, final["new"], final["legacy"] * final["r_low"])
    final["high"] = np.where(has_new, final["new"], final["legacy"] * final["r_high"])

    converted = (~has_new) & final["harmonized"].notna()
    print(f"[conversion] rows: {len(final):,} | measured (VIIRS): {int(has_new.sum()):,} "
          f"| converted (MODIS): {int(converted.sum()):,} "
          f"| no value: {int((~has_new & ~converted).sum()):,}")
    return final.drop(columns=["month", "r_median", "r_low", "r_high"])
