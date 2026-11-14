# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Filters on the detections table. Each step prints how many records it removes.
Order used by run_all: select_satellites -> compute_coverage -> apply_quality_filters."""

import pandas as pd

try:
    from pipeline.common import load_config
except ImportError:  # when run as: python3 pipeline/filters.py
    from common import load_config


def _report(step, before, after):
    print(f"[filters] {step}: {before:,} -> {after:,} (removed {before - after:,})")


def select_satellites(detections, config=None):
    """Keep only the satellites listed in config.sensors[...].satellites
    (an empty list means: keep every satellite of that sensor)."""
    config = config or load_config()
    keep = pd.Series(True, index=detections.index)
    for key, sensor_cfg in config["sensors"].items():
        wanted = [s.upper() for s in sensor_cfg["satellites"]]
        if not wanted:
            continue
        is_sensor = detections["sensor"] == sensor_cfg["name"]
        wanted_sat = detections["satellite"].astype(str).str.upper().isin(wanted)
        removed = int((is_sensor & ~wanted_sat).sum())
        print(f"[filters]   {sensor_cfg['name']}: keeping satellites {wanted}, removing {removed:,}")
        keep &= ~is_sensor | wanted_sat
    result = detections[keep]
    _report("select_satellites", len(detections), len(result))
    return result


def compute_coverage(detections, config=None):
    """Coverage of each sensor = operating dates from the config INTERSECTED with the dates in the data.
    Returns {"legacy": {"start": "YYYY-MM-DD", "end": ...}, "new": {...}}.
    Use it BEFORE apply_quality_filters so that filtering does not shrink the coverage."""
    config = config or load_config()
    coverage = {}
    for key, sensor_cfg in config["sensors"].items():
        rows = detections[detections["sensor"] == sensor_cfg["name"]]
        if rows.empty:
            print(f"[filters] WARNING: no data for {sensor_cfg['name']}")
            coverage[key] = {"start": None, "end": None}
            continue
        start = max(rows["date"].min(), pd.Timestamp(sensor_cfg["operating_start"]))
        end = rows["date"].max()
        if sensor_cfg["operating_end"] is not None:
            end = min(end, pd.Timestamp(sensor_cfg["operating_end"]))
        if start > end:
            print(f"[filters] WARNING: {sensor_cfg['name']} has an empty coverage")
            coverage[key] = {"start": None, "end": None}
            continue
        coverage[key] = {"start": start.strftime("%Y-%m-%d"), "end": end.strftime("%Y-%m-%d")}
        print(f"[filters] coverage {key} ({sensor_cfg['name']}): {coverage[key]['start']} -> {coverage[key]['end']}")
    return coverage


def apply_quality_filters(detections, config=None):
    """Same rules for both sensors (from config.filters):
    1) fire type must be in keep_fire_types
    2) MODIS: numeric confidence >= min_modis_confidence
       VIIRS: confidence letter must be in viirs_confidence_keep"""
    config = config or load_config()
    rules = config["filters"]
    legacy_name = config["sensors"]["legacy"]["name"]
    new_name = config["sensors"]["new"]["name"]

    # Step 1: fire type
    step1 = detections[detections["fire_type"].isin(rules["keep_fire_types"])]
    _report("fire type " + str(rules["keep_fire_types"]), len(detections), len(step1))

    # Step 2: confidence (a different rule for each sensor)
    is_legacy = step1["sensor"] == legacy_name
    is_new = step1["sensor"] == new_name
    numeric = pd.to_numeric(step1["confidence"].where(is_legacy), errors="coerce")
    legacy_ok = numeric >= rules["min_modis_confidence"]
    letters = [str(x).lower() for x in rules["viirs_confidence_keep"]]
    new_ok = step1["confidence"].astype(str).str.lower().isin(letters)
    keep = (is_legacy & legacy_ok) | (is_new & new_ok)
    print(f"[filters]   {legacy_name}: removed {int((is_legacy & ~keep).sum()):,} "
          f"(confidence < {rules['min_modis_confidence']})")
    print(f"[filters]   {new_name}: removed {int((is_new & ~keep).sum()):,} "
          f"(confidence not in {letters})")
    step2 = step1[keep]
    _report("confidence", len(step1), len(step2))

    print(f"[filters] quality filters total: {len(detections):,} -> {len(step2):,}")
    return step2
