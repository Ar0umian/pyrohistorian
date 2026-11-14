# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Write the 3 JSON files for the web app (docs/DATA_CONTRACT.md, version in config.contract_version):
meta.json, cells_weekly.json (sparse, key YYYY_WW), validation.json.
Output folder = config.paths.web_data_dir, file names = config.files. NaN becomes null."""

try:
    from pipeline.common import load_config, path_from_root, write_json
except ImportError:  # when run as: python3 pipeline/export_json.py
    from common import load_config, path_from_root, write_json

# Standard NASA FIRMS acknowledgement. The text is NOT in the config, so the team must check it.
ACKNOWLEDGEMENT = ("We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource "
                   "Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth "
                   "Science Data and Information System (ESDIS).")

COUNT_FIELDS = ("legacy", "new")   # whole numbers
TEXT_FIELDS = ("q",)               # text


def _is_nan(value):
    return value is None or value != value


def _convert_value(name, value):
    """One value of cells_weekly: counts -> int, q -> text, the rest -> number with 2 decimals. NaN -> None."""
    if name in TEXT_FIELDS:
        return None if _is_nan(value) else str(value)
    if _is_nan(value):
        return None
    if name in COUNT_FIELDS:
        return int(value)
    return round(float(value), 2)


def _round_table(table, columns, digits):
    """Records of a table with some columns rounded (NaN stays NaN, write_json turns it into null)."""
    table = table.copy()
    for column in columns:
        table[column] = table[column].astype(float).round(digits)
    return table.to_dict(orient="records")


def export_all(final, ratios, validation, coverage, config=None):
    """final table (with q), ratio summary, validation rows, coverage dict -> 3 files. Returns the paths."""
    config = config or load_config()
    if "q" not in final.columns:
        raise ValueError("The final table has no column q: run quality_codes.assign first")

    out_dir = config["paths"]["web_data_dir"]
    version = config["contract_version"]
    schema = config["schema"]

    for region in config["regions"]:
        if region["name"] == "CHANGE_ME":
            print("[export] WARNING: region '" + region["id"] + "' still has the name CHANGE_ME in the config")

    # ---- meta.json ----
    meta = {
        "contract_version": version,
        "project": config["project"],
        "regions": config["regions"],
        "grid": config["grid"],
        "time": config["time"],
        "units": config["units"],
        "sensors": config["sensors"],
        "filters": config["filters"],
        "coverage": coverage,
        "absent_means": schema["cells_weekly"]["absent_means"],
        "quality_codes": config["quality_codes"],
        "alarm": config["alarm"],
        "ui": config["ui"],
        "validation_method": config["validation"]["method"],
        "conversion": _round_table(ratios[["region_id", "month", "median", "low", "high", "n_years"]],
                                   ["median", "low", "high"], 4),
        "acknowledgement": ACKNOWLEDGEMENT,
    }
    meta_path = write_json(meta, path_from_root(out_dir, config["files"]["meta"]), indent=2)

    # ---- cells_weekly.json (sparse) ----
    value_fields = schema["cells_weekly"]["value_fields"]
    missing = [f for f in value_fields if f not in final.columns]
    if missing:
        raise ValueError("The final table has no column(s): " + str(missing))

    columns = ["region_id", "cell_id", "lat", "lon", "year", "week"] + list(value_fields)
    table = final[columns].sort_values(["region_id", "cell_id", "year", "week"])

    cells = {}
    for row in table.itertuples(index=False):
        cell = cells.get(row.cell_id)
        if cell is None:
            cell = {"cell_id": row.cell_id, "region_id": row.region_id,
                    "lat": float(row.lat), "lon": float(row.lon), "data": {}}
            cells[row.cell_id] = cell
        key = f"{int(row.year)}_{int(row.week):02d}"   # YYYY_WW
        cell["data"][key] = [_convert_value(name, getattr(row, name)) for name in value_fields]

    cell_list = list(cells.values())
    if cell_list and list(cell_list[0].keys()) != schema["cells_weekly"]["cell_fields"]:
        raise ValueError("Cell fields differ from config.schema.cells_weekly.cell_fields")

    cells_json = {
        "contract_version": version,
        "value_fields": value_fields,
        "absent_means": schema["cells_weekly"]["absent_means"],
        "cells": cell_list,
    }
    cells_path = write_json(cells_json, path_from_root(out_dir, config["files"]["cells"]))

    # ---- validation.json ----
    fields = schema["validation"]["fields"]
    validation_json = {
        "contract_version": version,
        "rows": _round_table(validation[fields], ["interval_coverage", "mean_abs_error"], 4),
    }
    validation_path = write_json(validation_json, path_from_root(out_dir, config["files"]["validation"]))

    for path in (meta_path, cells_path, validation_path):
        print(f"[export] {path}  ({path.stat().st_size / 1024:.0f} KB)")
    print(f"[export] cells: {len(cell_list):,} | cell-week values: {len(table):,}")
    return meta_path, cells_path, validation_path
