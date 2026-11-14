# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Print a report about every raw fire file listed in config.input.products.
It does NOT assume field names: it prints what it finds."""

import json
import math
from collections import Counter

try:
    from pipeline.common import load_config, path_from_root
except ImportError:  # when run as: python3 pipeline/inspect_data.py
    from common import load_config, path_from_root

# Fields whose NAME contains one of these words get their values listed.
CATEGORY_WORDS = ["satellite", "instrument", "confidence", "type",
                  "daynight", "version", "source"]
# Field names treated as latitude / longitude (lowercase).
LAT_NAMES = {"lat", "latitude", "geometry_lat"}
LON_NAMES = {"lon", "long", "longitude", "geometry_lon"}
MAX_VALUES_SHOWN = 25


def read_records(path):
    """Read a JSON file: a list of records, or GeoJSON. Returns a list of flat dicts."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        if "features" in data:               # GeoJSON FeatureCollection
            items = data["features"]
        else:                                # look for the first list inside the dict
            items = None
            for value in data.values():
                if isinstance(value, list):
                    items = value
                    break
            if items is None:
                raise ValueError("Could not find a list of records in this file")
    else:
        raise ValueError("Unknown JSON structure")

    records = []
    for item in items:
        if isinstance(item, dict) and "properties" in item and "geometry" in item:
            record = dict(item["properties"] or {})   # GeoJSON feature
            geometry = item.get("geometry") or {}
            coords = geometry.get("coordinates")
            if geometry.get("type") == "Point" and coords and len(coords) >= 2:
                record["geometry_lon"] = coords[0]    # GeoJSON order is lon, lat
                record["geometry_lat"] = coords[1]
            records.append(record)
        elif isinstance(item, dict):
            records.append(item)
    return records


def to_number(value):
    """Return value as a float, or None if it is not a number."""
    try:
        number = float(value)
        return None if math.isnan(number) else number
    except (TypeError, ValueError):
        return None


def describe_file(label, path):
    """Print the report for one file. Returns (south, north, west, east) or None."""
    print("=" * 70)
    print(label, "->", path)
    if not path.exists():
        print("  FILE NOT FOUND (skipped)")
        return None

    records = read_records(path)
    print("  Number of records:", len(records))
    if not records:
        return None

    field_counts = Counter()
    date_range = {}      # date-like field -> [min text, max text]
    categories = {}      # category field -> Counter of values
    numeric_range = {}   # category field -> [min, max] when values are numbers
    lat_min = lon_min = float("inf")
    lat_max = lon_max = float("-inf")

    for record in records:
        for key, value in record.items():
            field_counts[key] += 1
            name = key.lower()

            if "date" in name and value not in (None, ""):   # dates are ISO text, so text min/max works
                text = str(value)
                low_high = date_range.setdefault(key, [text, text])
                low_high[0] = min(low_high[0], text)
                low_high[1] = max(low_high[1], text)

            if any(word in name for word in CATEGORY_WORDS):
                categories.setdefault(key, Counter())[value] += 1
                number = to_number(value)
                if number is not None:
                    rng = numeric_range.setdefault(key, [number, number])
                    rng[0] = min(rng[0], number)
                    rng[1] = max(rng[1], number)

            if name in LAT_NAMES:
                number = to_number(value)
                if number is not None:
                    lat_min, lat_max = min(lat_min, number), max(lat_max, number)
            if name in LON_NAMES:
                number = to_number(value)
                if number is not None:
                    lon_min, lon_max = min(lon_min, number), max(lon_max, number)

    print("  Field names:", list(field_counts.keys()))
    incomplete = {k: v for k, v in field_counts.items() if v != len(records)}
    if incomplete:
        print("  Fields missing in some records (field: how many records have it):", incomplete)
    print("  First record (sample):", records[0])

    if date_range:
        for key, (low, high) in date_range.items():
            print(f"  Date range in field '{key}': {low}  ->  {high}")
    else:
        print("  No field with 'date' in its name was found: check the sample record above.")

    for key, counter in categories.items():
        print(f"  Values in field '{key}' ({len(counter)} different):")
        for value, count in counter.most_common(MAX_VALUES_SHOWN):
            print(f"      {value!r}: {count}")
        if key in numeric_range:
            print(f"      numeric range: {numeric_range[key][0]} to {numeric_range[key][1]}")

    if lat_min == float("inf") or lon_min == float("inf"):
        print("  No latitude/longitude field was recognised: check the field names above.")
        return None
    print(f"  Lat range: {lat_min} to {lat_max}")
    print(f"  Lon range: {lon_min} to {lon_max}")
    return (lat_min, lat_max, lon_min, lon_max)


def main():
    config = load_config()
    step = config["grid"]["step_deg"]
    raw_root = config["input"]["root"]

    all_south, all_north = float("inf"), float("-inf")
    all_west, all_east = float("inf"), float("-inf")

    for product_id, product in config["input"]["products"].items():
        for kind in ("archive", "nrt"):
            path = path_from_root(raw_root, product["folder"], product[kind])
            result = describe_file(f"{product_id} [{kind}] (sensor {product['sensor']}, role {product['role']})", path)
            if result:
                south, north, west, east = result
                all_south, all_north = min(all_south, south), max(all_north, north)
                all_west, all_east = min(all_west, west), max(all_east, east)

    print("=" * 70)
    if all_south == float("inf"):
        print("No coordinates found, so no bbox can be suggested.")
        return

    # Round OUTWARD to the grid step so the bbox lines up with the grid cells.
    bbox = {
        "south": math.floor(all_south / step) * step,
        "west": math.floor(all_west / step) * step,
        "north": math.ceil(all_north / step) * step,
        "east": math.ceil(all_east / step) * step,
    }
    print("Suggested bbox covering ALL files (copy into shared/project_config.json,")
    print("regions[0].bbox, only by agreement with Owner B - that file is SHARED):")
    print(json.dumps(bbox))


if __name__ == "__main__":
    main()
