# AI disclosure: This file was written with the help of Claude (Anthropic) and must be reviewed by the team.
"""Add the quality code q to the final table:
G = measured by the new sensor (VIIRS), U = converted from the legacy sensor (MODIS), B = no valid value."""

import numpy as np

try:
    from pipeline.common import load_config
except ImportError:  # when run as: python3 pipeline/quality_codes.py
    from common import load_config

# The letters themselves are defined in config.quality_codes; we check below that they exist.
MEASURED = "G"
CONVERTED = "U"
MISSING = "B"


def assign(final, config=None):
    """final table -> same table + column q."""
    config = config or load_config()
    for code in (MEASURED, CONVERTED, MISSING):
        if code not in config["quality_codes"]:
            raise ValueError("Quality code '" + code + "' is not defined in config.quality_codes")

    result = final.copy()
    measured = result["new"].notna()
    converted = (~measured) & result["harmonized"].notna()
    result["q"] = np.where(measured, MEASURED, np.where(converted, CONVERTED, MISSING))

    counts = result["q"].value_counts()
    print("[quality] " + " | ".join(f"{code}: {int(counts.get(code, 0)):,}"
                                   for code in (MEASURED, CONVERTED, MISSING)))
    return result
