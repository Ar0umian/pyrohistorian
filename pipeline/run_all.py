# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Run the whole pipeline in the order of docs/INTERFACES.md and finish with contract_check.
Usage (from the project root):
  python3 pipeline/run_all.py               full run (reads the raw files: takes a few minutes)
  python3 pipeline/run_all.py --use-cache   reuse the filtered detections of the last run (fast)
  python3 pipeline/run_all.py --inspect     also print the inspect_data report first
Exit code: 0 = everything fine, 1 = a step failed or the contract check found problems."""

import json
import sys
import time

import pandas as pd

try:
    from pipeline.common import load_config, path_from_root
    from pipeline import (inspect_data, ingest, filters, build_grid_weekly, conversion_model,
                          quality_codes, validation as validation_step, export_json, contract_check)
except ImportError:  # when run as: python3 pipeline/run_all.py
    from common import load_config, path_from_root
    import inspect_data, ingest, filters, build_grid_weekly, conversion_model
    import quality_codes, export_json, contract_check
    import validation as validation_step

CACHE_NAME = "detections_filtered.pkl"


def banner(text):
    print()
    print("=" * 70)
    print(text)
    print("=" * 70)


def _cache_key(config):
    """The cache is only valid for the same regions, years, filters, sensors and input files."""
    parts = {name: config[name] for name in ("regions", "time", "filters", "sensors", "input")}
    return json.dumps(parts, sort_keys=True)


def _load_detections(config, use_cache):
    """Steps 1-3: ingest, satellites, coverage, quality filters. Returns (detections, coverage) or None."""
    cache_path = path_from_root(config["paths"]["interim_dir"], CACHE_NAME)
    key = _cache_key(config)

    if use_cache and cache_path.exists():
        cached_key, detections, coverage = pd.read_pickle(cache_path)
        if cached_key == key:
            print(f"Using the cache {cache_path.name}: {len(detections):,} filtered detections")
            return detections, coverage
        print("The cache was made with a different config: ignoring it")

    banner("Step 1/8: ingest (read the raw files)")
    detections = ingest.load_all()
    banner("Step 2/8: filters (satellites, coverage, quality)")
    detections = filters.select_satellites(detections, config)
    coverage = filters.compute_coverage(detections, config)
    detections = filters.apply_quality_filters(detections, config)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    pd.to_pickle((key, detections, coverage), cache_path)
    return detections, coverage


def _check_overlap(coverage):
    """Returns True if the two sensors overlap in time. Prints a clear message either way."""
    legacy, new = coverage["legacy"], coverage["new"]
    if None in (legacy["start"], legacy["end"], new["start"], new["end"]):
        print("PROBLEM: one of the sensors has no data, so the two sensors do NOT overlap.")
        print("         Check the region bbox, the input files and config.sensors.")
        return False
    start = max(legacy["start"], new["start"])
    end = min(legacy["end"], new["end"])
    if start > end:
        print(f"PROBLEM: the two sensors do NOT overlap in time (legacy {legacy['start']} -> {legacy['end']}, "
              f"new {new['start']} -> {new['end']}). A conversion is not possible.")
        return False
    print(f"The two sensors overlap from {start} to {end}")
    return True


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    started = time.time()
    config = load_config()

    if "--inspect" in argv:
        banner("Step 0: inspect_data")
        inspect_data.main()

    detections, coverage = _load_detections(config, "--use-cache" in argv)
    print("Detections after filtering:", f"{len(detections):,}")
    if detections.empty:
        print("PROBLEM: no detections left. Check the region bbox in shared/project_config.json.")
        return 1
    if not _check_overlap(coverage):
        return 1

    banner("Step 3/8: weekly grid")
    weekly = build_grid_weekly.build(detections, coverage, config)
    if weekly.empty:
        print("PROBLEM: the weekly table is empty.")
        return 1

    banner("Step 4/8: conversion model (ratios from the overlap years)")
    ratio_table = conversion_model.yearly_ratio_table(weekly, config)
    if ratio_table.empty:
        print("PROBLEM: no overlap weeks with enough detections: a conversion is not possible.")
        return 1
    ratios = conversion_model.summarize_ratios(ratio_table, config=config)
    if ratios.empty:
        print(f"PROBLEM: no region-month has {config['conversion']['min_overlap_years']} overlap years "
              f"(config.conversion.min_overlap_years).")
        return 1
    print("Region-months with a ratio:", len(ratios))
    final = conversion_model.apply_conversion(weekly, ratios, config)

    banner("Step 5/8: quality codes")
    final = quality_codes.assign(final, config)

    banner("Step 6/8: validation (leave one year out)")
    validation_rows = validation_step.run(ratio_table, config)

    banner("Step 7/8: export the 3 JSON files")
    export_json.export_all(final, ratios, validation_rows, coverage, config)

    banner("Step 8/8: contract check")
    code = contract_check.run(config)

    print()
    print(f"Done in {time.time() - started:.0f} seconds. Exit code: {code}")
    return code


if __name__ == "__main__":
    sys.exit(main())
