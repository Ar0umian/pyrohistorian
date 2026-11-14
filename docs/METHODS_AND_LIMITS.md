# Methods and limits (Owner A)
- Same filters for both sensors; one satellite per sensor for consistency (see config sensors).
- Week rule: week = min(52, (day_of_year - 1) // 7 + 1); week 52 has 8-9 days.
- A week counts for a sensor only if the whole week is inside its coverage.
- Weekly table is sparse (absent = zero inside coverage).
- Conversion: monthly VIIRS/MODIS ratio per region from overlap years; range = min..max yearly ratio.
- Validation: leave-one-year-out on monthly region totals.
## Limits (keep honest)
- Ratio assumed stable over time. Zero MODIS weeks convert to zero (VIIRS sees smaller fires).
- Counts are detections, not burned area. Coverage is inferred from the downloaded data.
- NRT data is preliminary.
