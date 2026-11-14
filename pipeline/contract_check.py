# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Check the 3 JSON files against shared/project_config.json and docs/DATA_CONTRACT.md.
Prints every problem (max 50 per kind) and returns exit code 1 if there is any problem, else 0.
Usage:  python3 pipeline/contract_check.py            -> checks paths.web_data_dir (real data)
        python3 pipeline/contract_check.py --sample   -> checks paths.web_sample_dir (B's fake data)"""

import json
import re
import sys

try:
    from pipeline.common import load_config, path_from_root
except ImportError:  # when run as: python3 pipeline/contract_check.py
    from common import load_config, path_from_root

MAX_SHOWN = 50
KEY_PATTERN = re.compile(r"^(\d{4})_(\d{2})$")        # YYYY_WW
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")      # YYYY-MM-DD
TOLERANCE = 0.006                                      # values are rounded to 2 decimals

# Keys of meta.json, copied from docs/DATA_CONTRACT.md
META_KEYS = ["contract_version", "project", "regions", "grid", "time", "units", "sensors", "filters",
             "coverage", "absent_means", "quality_codes", "alarm", "ui", "validation_method",
             "conversion", "acknowledgement"]
CONVERSION_KEYS = ["region_id", "month", "median", "low", "high", "n_years"]


class Problems:
    """Collects problems, grouped by kind, so a broken file does not print 100,000 lines."""

    def __init__(self):
        self.groups = {}

    def add(self, kind, text):
        self.groups.setdefault(kind, []).append(text)

    def total(self):
        return sum(len(v) for v in self.groups.values())

    def print_all(self):
        for kind, items in self.groups.items():
            print(f"[contract] PROBLEM ({len(items)}x): {kind}")
            for text in items[:MAX_SHOWN]:
                print("    -", text)
            if len(items) > MAX_SHOWN:
                print(f"    ... and {len(items) - MAX_SHOWN} more of the same kind")


def _load(path, problems):
    """Read one JSON file. NaN / Infinity are not valid JSON, so they are reported."""
    if not path.exists():
        problems.add("file missing", str(path))
        return None
    bad = []

    def reject(token):
        bad.append(token)
        return None

    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f, parse_constant=reject)
    except json.JSONDecodeError as error:
        problems.add("file is not valid JSON", f"{path.name}: {error}")
        return None
    if bad:
        problems.add("NaN/Infinity in file (must be null)", f"{path.name}: {len(bad)} value(s)")
    if not isinstance(data, dict):
        problems.add("file must contain a JSON object", path.name)
        return None
    return data


def _check_meta(meta, config, problems):
    for key in META_KEYS:
        if key not in meta:
            problems.add("meta.json: missing key", key)
    if meta.get("contract_version") != config["contract_version"]:
        problems.add("meta.json: contract_version differs from config",
                     f"{meta.get('contract_version')} != {config['contract_version']}")

    coverage = meta.get("coverage")
    if not isinstance(coverage, dict):
        problems.add("meta.json: coverage missing or not an object", str(coverage))
    else:
        for sensor in ("legacy", "new"):
            item = coverage.get(sensor)
            if not isinstance(item, dict) or "start" not in item or "end" not in item:
                problems.add("meta.json: coverage needs {legacy,new} x {start,end}", sensor)
                continue
            for edge in ("start", "end"):
                if not isinstance(item[edge], str) or not DATE_PATTERN.match(item[edge]):
                    problems.add("meta.json: coverage date must be YYYY-MM-DD", f"{sensor}.{edge} = {item[edge]!r}")

    if isinstance(meta.get("quality_codes"), dict) and set(meta["quality_codes"]) != set(config["quality_codes"]):
        problems.add("meta.json: quality_codes differ from config", str(sorted(meta["quality_codes"])))

    conversion = meta.get("conversion")
    if not isinstance(conversion, list):
        problems.add("meta.json: conversion must be a list", str(type(conversion)))
        return
    for row in conversion:
        if set(row.keys()) != set(CONVERSION_KEYS):
            problems.add("meta.json: conversion row fields wrong", str(sorted(row.keys())))
            continue
        if None in (row["low"], row["median"], row["high"]) or not (row["low"] <= row["median"] <= row["high"]):
            problems.add("meta.json: conversion needs low <= median <= high", str(row))
        if not 1 <= row["month"] <= 12:
            problems.add("meta.json: conversion month must be 1..12", str(row))


def _check_cells(cells_json, config, problems):
    schema = config["schema"]["cells_weekly"]
    value_fields = schema["value_fields"]
    index = {name: i for i, name in enumerate(value_fields)}
    codes = set(config["quality_codes"])
    first_year, last_year = config["time"]["first_year"], config["time"]["last_year"]
    weeks_per_year = config["time"]["weeks_per_year"]
    region_ids = {r["id"]: r["bbox"] for r in config["regions"]}

    if cells_json.get("contract_version") != config["contract_version"]:
        problems.add("cells_weekly.json: contract_version differs from config", str(cells_json.get("contract_version")))
    if cells_json.get("value_fields") != value_fields:
        problems.add("cells_weekly.json: value_fields differ from config.schema", str(cells_json.get("value_fields")))
    if cells_json.get("absent_means") != schema["absent_means"]:
        problems.add("cells_weekly.json: absent_means differs from config.schema", str(cells_json.get("absent_means")))

    cells = cells_json.get("cells")
    if not isinstance(cells, list) or not cells:
        problems.add("cells_weekly.json: 'cells' must be a non-empty list", str(type(cells)))
        return

    n_values = 0
    seen_ids = set()
    for cell in cells:
        name = cell.get("cell_id", "?")
        if set(cell.keys()) != set(schema["cell_fields"]):
            problems.add("cell fields differ from config.schema.cells_weekly.cell_fields", f"{name}: {sorted(cell.keys())}")
            continue
        if name in seen_ids:
            problems.add("duplicate cell_id", name)
        seen_ids.add(name)
        if cell["region_id"] not in region_ids:
            problems.add("cell has an unknown region_id", f"{name}: {cell['region_id']}")
        elif not isinstance(cell["lat"], (int, float)) or not isinstance(cell["lon"], (int, float)):
            problems.add("cell lat/lon must be numbers", name)
        else:
            box = region_ids[cell["region_id"]]
            if not (box["south"] <= cell["lat"] <= box["north"] and box["west"] <= cell["lon"] <= box["east"]):
                problems.add("cell centre is outside its region bbox", name)
        if not isinstance(cell["data"], dict):
            problems.add("cell data must be an object", name)
            continue

        for key, values in cell["data"].items():
            n_values += 1
            where = f"{name} {key}"
            match = KEY_PATTERN.match(key)
            if not match:
                problems.add("week key must look like YYYY_WW", where)
                continue
            year, week = int(match.group(1)), int(match.group(2))
            if not 1 <= week <= weeks_per_year:
                problems.add(f"week must be 1..{weeks_per_year}", where)
            if not first_year <= year <= last_year:
                problems.add(f"year must be {first_year}..{last_year}", where)
            if not isinstance(values, list) or len(values) != len(value_fields):
                problems.add("a week must be a list with one entry per value_fields", where)
                continue

            q = values[index["q"]]
            if q not in codes:
                problems.add("invalid quality code", f"{where}: {q!r}")
            low, harmonized, high = values[index["low"]], values[index["harmonized"]], values[index["high"]]
            if None not in (low, harmonized, high):
                if not (low <= harmonized + TOLERANCE and harmonized <= high + TOLERANCE):
                    problems.add("low <= harmonized <= high is violated", f"{where}: {low}, {harmonized}, {high}")
            for field in ("legacy", "new"):
                value = values[index[field]]
                if value is not None and value < 0:
                    problems.add("counts cannot be negative", f"{where}: {field} = {value}")
            # The quality code must agree with the values
            new_value, legacy_value = values[index["new"]], values[index["legacy"]]
            if q == "G" and new_value is None:
                problems.add("q = G needs a measured new-sensor value", where)
            if q == "U" and (new_value is not None or legacy_value is None or harmonized is None):
                problems.add("q = U needs: no new value, a legacy value and a harmonized value", where)
            if q == "B" and harmonized is not None:
                problems.add("q = B must have harmonized = null", where)
            if q in ("G", "U") and harmonized is None:
                problems.add("q = G/U must have a harmonized value", where)
    print(f"[contract] cells_weekly.json: {len(cells):,} cells, {n_values:,} cell-week values checked")


def _check_validation(validation_json, config, problems):
    fields = config["schema"]["validation"]["fields"]
    region_ids = {r["id"] for r in config["regions"]}
    if validation_json.get("contract_version") != config["contract_version"]:
        problems.add("validation.json: contract_version differs from config", str(validation_json.get("contract_version")))
    rows = validation_json.get("rows")
    if not isinstance(rows, list):
        problems.add("validation.json: 'rows' must be a list", str(type(rows)))
        return
    for row in rows:
        if set(row.keys()) != set(fields):
            problems.add("validation row fields differ from config.schema.validation.fields", str(sorted(row.keys())))
            continue
        if row["region_id"] not in region_ids:
            problems.add("validation row has an unknown region_id", str(row))
        if not isinstance(row["month"], int) or not 1 <= row["month"] <= 12:
            problems.add("validation month must be 1..12", str(row))
        coverage = row["interval_coverage"]
        if coverage is None or not 0 <= coverage <= 1:
            problems.add("interval_coverage must be between 0 and 1", str(row))
        if row["mean_abs_error"] is None or row["mean_abs_error"] < 0:
            problems.add("mean_abs_error must be >= 0", str(row))
        if not isinstance(row["n_cases"], int) or row["n_cases"] < 1:
            problems.add("n_cases must be an integer >= 1", str(row))
    print(f"[contract] validation.json: {len(rows)} rows checked")


def run(config=None, directory=None):
    """Check the three files. Returns 0 if everything is fine, 1 if there is any problem."""
    config = config or load_config()
    folder = path_from_root(directory or config["paths"]["web_data_dir"])
    print("[contract] checking folder:", folder)
    problems = Problems()

    meta = _load(folder / config["files"]["meta"], problems)
    cells = _load(folder / config["files"]["cells"], problems)
    validation = _load(folder / config["files"]["validation"], problems)
    if meta is not None:
        _check_meta(meta, config, problems)
    if cells is not None:
        _check_cells(cells, config, problems)
    if validation is not None:
        _check_validation(validation, config, problems)

    if problems.total() == 0:
        print("[contract] OK: the 3 files follow the contract")
        return 0
    problems.print_all()
    print(f"[contract] FAILED: {problems.total()} problem(s)")
    return 1


if __name__ == "__main__":
    config = load_config()
    folder = config["paths"]["web_sample_dir"] if "--sample" in sys.argv else None
    sys.exit(run(config, folder))
