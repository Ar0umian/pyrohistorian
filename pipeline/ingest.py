# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Read the raw fire files into ONE detections table.
Columns: date, lat, lon, sensor, satellite, confidence, fire_type, acq_time, source
The raw files are huge, so we read them record by record (streaming) and keep
only what we need: years inside config.time and points inside the region boxes."""

import json
import sys
from array import array

import numpy as np
import pandas as pd

try:
    from pipeline.common import load_config, path_from_root
except ImportError:  # when run as: python3 pipeline/ingest.py
    from common import load_config, path_from_root

# Field names in the RAW files (taken from the inspect_data report).
F_LAT = "latitude"
F_LON = "longitude"
F_DATE = "acq_date"
F_TIME = "acq_time"
F_SAT = "satellite"
F_CONF = "confidence"
F_TYPE = "type"

CHUNK_SIZE = 16 * 1024 * 1024  # read the file 16 MB at a time
DETECTION_COLUMNS = ["date", "lat", "lon", "sensor", "satellite",
                     "confidence", "fire_type", "acq_time", "source"]


def iter_records(path):
    """Yield the records of a big JSON file (a list of records) one by one,
    without loading the whole file into memory."""
    decoder = json.JSONDecoder()
    with open(path, encoding="utf-8") as f:
        # GeoJSON or a dict: fall back to loading it all (fine for small files).
        first = f.read(1)
        while first and first.isspace():
            first = f.read(1)
        f.seek(0)
        if first == "{":
            data = json.load(f)
            items = data.get("features", [])
            for item in items:
                record = dict(item.get("properties") or {})
                coords = (item.get("geometry") or {}).get("coordinates")
                if coords and len(coords) >= 2:
                    record[F_LON], record[F_LAT] = coords[0], coords[1]
                yield record
            return

        buf = ""
        started = False
        at_end = False
        while True:
            if not at_end:
                chunk = f.read(CHUNK_SIZE)
                if chunk:
                    buf += chunk
                else:
                    at_end = True
            if not started:
                buf = buf.lstrip()
                if not buf:
                    if at_end:
                        return
                    continue
                if buf[0] != "[":
                    raise ValueError("Expected a JSON list of records in " + str(path))
                buf = buf[1:]
                started = True
            pos = 0
            size = len(buf)
            while True:
                while pos < size and buf[pos] in " \t\r\n,":
                    pos += 1
                if pos >= size:
                    break
                if buf[pos] == "]":
                    return
                try:
                    record, pos = decoder.raw_decode(buf, pos)
                except json.JSONDecodeError:
                    if at_end:
                        raise
                    break  # the record is cut in half: read more data first
                yield record
            buf = buf[pos:]
            if at_end and not buf.strip():
                return


def _to_int(value, default=None):
    """'0016' -> 16, '54' -> 54, 'n' -> default."""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _confidence(value):
    """MODIS gives a number (as text), VIIRS gives a letter. Keep a number or a lowercase letter."""
    number = _to_int(value)
    if number is not None:
        return number
    return str(value).strip().lower()


def _region_envelope(config):
    """One box that contains ALL region boxes (used only to skip far-away points early)."""
    boxes = [r["bbox"] for r in config["regions"]]
    return (min(b["south"] for b in boxes), min(b["west"] for b in boxes),
            max(b["north"] for b in boxes), max(b["east"] for b in boxes))


def _read_one_file(path, sensor, source, config):
    """Read one raw file into a table (only years and area we need)."""
    south, west, north, east = _region_envelope(config)
    first_year = config["time"]["first_year"]
    last_year = config["time"]["last_year"]

    lat, lon = array("d"), array("d")
    ymd, hhmm = array("i"), array("i")  # date as 20250131, time as 1630
    conf, ftype, sat = [], [], []

    seen = 0
    for rec in iter_records(path):
        seen += 1
        if seen % 2000000 == 0:
            print(f"    ... {seen:,} records read, {len(lat):,} kept", flush=True)
        date_text = str(rec[F_DATE])
        year = int(date_text[:4])
        if year < first_year or year > last_year:
            continue
        la, lo = float(rec[F_LAT]), float(rec[F_LON])
        if la < south or la > north or lo < west or lo > east:
            continue
        lat.append(la)
        lon.append(lo)
        ymd.append(year * 10000 + int(date_text[5:7]) * 100 + int(date_text[8:10]))
        hhmm.append(_to_int(rec.get(F_TIME), 0))
        conf.append(_confidence(rec.get(F_CONF)))
        ftype.append(_to_int(rec.get(F_TYPE)))
        sat.append(sys.intern(str(rec.get(F_SAT))))

    print(f"    {path.name}: {seen:,} records read, {len(lat):,} kept (years + region box)")

    n = len(lat)
    table = pd.DataFrame({
        "date": pd.to_datetime(pd.Series(np.array(ymd, dtype="int64")).astype(str), format="%Y%m%d"),
        "lat": np.array(lat, dtype="float64"),
        "lon": np.array(lon, dtype="float64"),
        "sensor": [sensor] * n,
        "satellite": sat,
        "confidence": conf,
        "fire_type": pd.array(ftype, dtype="Int64"),
        "acq_time": np.array(hhmm, dtype="int64"),
        "source": [source] * n,
    })
    return table[DETECTION_COLUMNS]


def load_product(product_id):
    """Read one product: the archive file plus the nrt file (according to config.input.nrt_policy)."""
    config = load_config()
    product = config["input"]["products"][product_id]
    folder = path_from_root(config["input"]["root"], product["folder"])
    archive_path = folder / product["archive"]
    nrt_path = folder / product["nrt"]
    policy = config["input"]["nrt_policy"]

    print(f"[ingest] {product_id} ({product['sensor']}) archive: {archive_path.name}")
    if not archive_path.exists():
        raise FileNotFoundError("Archive file not found: " + str(archive_path))
    archive = _read_one_file(archive_path, product["sensor"], "archive", config)

    if nrt_path.exists():
        print(f"[ingest] {product_id} nrt: {nrt_path.name}")
        nrt = _read_one_file(nrt_path, product["sensor"], "nrt", config)
    else:
        print(f"[ingest] WARNING: nrt file not found, skipped: {nrt_path}")
        nrt = archive.iloc[0:0]

    if policy == "only_after_archive_end":
        # The archive is the final version. Near-real-time data is used ONLY for days after it ends.
        if len(archive) > 0:
            archive_end = archive["date"].max()
            before = len(nrt)
            nrt = nrt[nrt["date"] > archive_end]
            print(f"    nrt policy '{policy}': archive ends {archive_end.date()}, "
                  f"nrt records removed (overlap): {before - len(nrt):,}")
    else:
        raise ValueError("Unknown input.nrt_policy: " + str(policy))

    table = pd.concat([archive, nrt], ignore_index=True)
    before = len(table)
    table = table.drop_duplicates(subset=["date", "lat", "lon", "acq_time", "satellite"])
    print(f"    duplicates removed: {before - len(table):,}")
    return table.sort_values("date").reset_index(drop=True)


def load_all():
    """Read every product whose role is legacy or new (reserve is skipped) into ONE detections table."""
    config = load_config()
    tables = []
    for product_id, product in config["input"]["products"].items():
        if product["role"] not in ("legacy", "new"):
            print(f"[ingest] skipping {product_id} (role: {product['role']})")
            continue
        tables.append(load_product(product_id))

    detections = pd.concat(tables, ignore_index=True)
    first_year = config["time"]["first_year"]
    last_year = config["time"]["last_year"]
    detections = detections[(detections["date"].dt.year >= first_year) &
                            (detections["date"].dt.year <= last_year)]
    print("[ingest] total records:", f"{len(detections):,}")
    print(detections.groupby(["sensor", "satellite", "source"]).size().to_string())
    return detections.sort_values("date").reset_index(drop=True)


if __name__ == "__main__":
    load_all()
