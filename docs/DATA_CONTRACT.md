# Data contract (version 1). Source of truth: shared/project_config.json
Output files in paths.web_data_dir, written by pipeline (A), read by the web app (B):
- meta.json: contract_version, project, regions, grid, time, units, sensors, filters, coverage {legacy,new}{start,end},
  absent_means, quality_codes, alarm, ui, validation_method, conversion [{region_id, month, median, low, high, n_years}],
  acknowledgement.
- cells_weekly.json: {contract_version, value_fields, absent_means, cells:[{cell_id, region_id, lat, lon,
  data:{"YYYY_WW":[legacy,new,harmonized,low,high,q]}}]}. SPARSE: an absent week means zero detections if inside
  meta.coverage for that sensor, otherwise missing.
- validation.json: {contract_version, rows:[{region_id, month, interval_coverage, mean_abs_error, n_cases}]}
Changing anything here or in the config: bump contract_version, commit with "CONTRACT:", tell the other person.
