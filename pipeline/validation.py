# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Leave-one-year-out validation of the MODIS -> VIIRS conversion.
For each overlap year: estimate the ratios WITHOUT that year, predict that year's VIIRS monthly
total from the MODIS total, and compare with the real VIIRS total."""

import pandas as pd

try:
    from pipeline.common import load_config
    from pipeline.conversion_model import summarize_ratios
except ImportError:  # when run as: python3 pipeline/validation.py
    from common import load_config
    from conversion_model import summarize_ratios


def run(ratio_table, config=None):
    """ratio table -> validation rows, one per region and month.
    interval_coverage = share of cases where the real VIIRS total was inside [low, high]
    mean_abs_error    = mean |predicted (median ratio) - real| in detections (monthly total over overlap weeks)
    n_cases           = number of left-out years that could be tested"""
    config = config or load_config()
    fields = config["schema"]["validation"]["fields"]

    if ratio_table.empty:
        print("[validation] WARNING: empty ratio table, nothing to validate")
        return pd.DataFrame(columns=fields)

    cases = []
    for year in sorted(ratio_table["year"].unique()):
        # 1) ratios estimated WITHOUT this year
        ratios = summarize_ratios(ratio_table, exclude_year=year, config=config)
        # 2) the left-out year: predict VIIRS from MODIS
        test = ratio_table[ratio_table["year"] == year]
        merged = test.merge(ratios, on=["region_id", "month"], how="inner")
        if merged.empty:
            continue
        merged["predicted"] = merged["legacy_sum"] * merged["median"]
        merged["pred_low"] = merged["legacy_sum"] * merged["low"]
        merged["pred_high"] = merged["legacy_sum"] * merged["high"]
        # 3) compare with the real VIIRS total
        merged["abs_error"] = (merged["predicted"] - merged["new_sum"]).abs()
        merged["inside"] = (merged["new_sum"] >= merged["pred_low"]) & (merged["new_sum"] <= merged["pred_high"])
        cases.append(merged[["region_id", "month", "abs_error", "inside"]])

    if not cases:
        print("[validation] WARNING: no case could be tested (too few overlap years?)")
        return pd.DataFrame(columns=fields)

    all_cases = pd.concat(cases, ignore_index=True)
    rows = all_cases.groupby(["region_id", "month"], as_index=False).agg(
        interval_coverage=("inside", "mean"),
        mean_abs_error=("abs_error", "mean"),
        n_cases=("inside", "size"))
    rows["interval_coverage"] = rows["interval_coverage"].astype(float)

    print(f"[validation] cases: {len(all_cases)} | overall interval coverage: "
          f"{all_cases['inside'].mean():.2f} | overall mean abs error: {all_cases['abs_error'].mean():.1f}")
    return rows[fields]
