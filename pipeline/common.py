# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Shared helpers for the pipeline: read the config, build paths, write JSON."""

import json
import math
from pathlib import Path

# numpy is used by the pipeline anyway; we import it safely so this file also works without it.
try:
    import numpy as np
except ImportError:
    np = None

# The project root is the PARENT of the pipeline folder (this file lives in pipeline/).
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# The config file is the one fixed location (every other path comes from inside it).
CONFIG_RELATIVE_PATH = "shared/project_config.json"


def path_from_root(*parts):
    """Build a full path from the project root.
    Example: path_from_root("data/raw", "file.json") -> /.../PyroHistorian/data/raw/file.json
    """
    return PROJECT_ROOT.joinpath(*[str(p) for p in parts])


def load_config():
    """Read shared/project_config.json and return it as a dictionary."""
    config_path = path_from_root(CONFIG_RELATIVE_PATH)
    with open(config_path, encoding="utf-8") as f:
        return json.load(f)


def _clean(value):
    """Turn a value into something the json module accepts.
    - NaN / infinity -> None (written as null)
    - numpy numbers / arrays -> normal Python numbers / lists
    - dates -> text
    """
    if value is None:
        return None

    # numpy single numbers (np.int64, np.float64, np.bool_ ...) -> normal Python numbers
    if np is not None and isinstance(value, np.generic):
        value = value.item()

    # numpy arrays -> lists
    if np is not None and isinstance(value, np.ndarray):
        return [_clean(v) for v in value.tolist()]

    if isinstance(value, dict):
        return {str(k): _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_clean(v) for v in value]

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, (bool, int, str)):
        return value

    # pandas NaT / missing values are "not equal to themselves"
    try:
        if value != value:
            return None
    except Exception:
        pass

    # dates and timestamps -> ISO text
    if hasattr(value, "isoformat"):
        return value.isoformat()

    return str(value)


def write_json(data, path, indent=None):
    """Write data to a JSON file. NaN becomes null. Creates the folder if needed.
    path can be absolute, or relative to the project root.
    Returns the full path that was written.
    """
    path = Path(path)
    if not path.is_absolute():
        path = path_from_root(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    cleaned = _clean(data)
    separators = None if indent else (",", ":")  # compact output when no indent
    with open(path, "w", encoding="utf-8") as f:
        # allow_nan=False makes Python raise an error if a NaN slipped through
        json.dump(cleaned, f, ensure_ascii=False, indent=indent,
                  separators=separators, allow_nan=False)
    return path
