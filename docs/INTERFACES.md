# Interfaces (names are FIXED; the owner implements, the other side relies on them)

## Data shapes
- Detections table (ingest/filters output): date, lat, lon, sensor (MODIS|VIIRS), satellite, confidence,
  fire_type, acq_time, source (archive|nrt)
- Weekly table (build_grid_weekly output): region_id, cell_id, lat, lon, year, week, legacy, new
  (NaN = outside that sensor's coverage; absent row = zero detections inside coverage)
- Final table (after conversion + quality): weekly table + harmonized, low, high, q
- series (web): series[year][week] = { value, low, high, q }   (missing weeks are absent or q = "B")
- states (web): same keys as series, plus state in alarm.states

## Pipeline (Owner A): all functions read their settings from the config
| File | Functions | Input -> Output |
|---|---|---|
| common.py | load_config, path_from_root, write_json | - |
| inspect_data.py | main | prints a report, returns nothing |
| ingest.py | load_product, load_all | product id -> detections table; all products -> one table (dedupe archive/nrt per nrt_policy) |
| filters.py | select_satellites, compute_coverage, apply_quality_filters | detections -> detections (+ coverage dict {legacy,new}{start,end}) |
| build_grid_weekly.py | build | detections + coverage -> weekly table |
| conversion_model.py | yearly_ratio_table, summarize_ratios, apply_conversion | weekly -> ratio table -> ratios -> final table (harmonized, low, high) |
| validation.py | run | ratio table -> validation rows |
| quality_codes.py | assign | final table -> final table + q |
| export_json.py | export_all | final table, ratios, validation, coverage -> the 3 JSON files |
| contract_check.py | run | checks the 3 JSON files against the config; exit code 0/1 |
| run_all.py | main | runs everything in order, ends with contract_check |

## Web (Owner B): all functions read settings from the config / meta.json
| File | Functions | Input -> Output |
|---|---|---|
| config_loader.js | loadAll | -> { config, meta, cells, validation }; uses sample dir if web.use_sample_data is true; checks contract_version |
| map_aoi.js | initMap, getCellsInAoi | callback on rectangle change; (aoi, cells) -> cells inside |
| aggregate.js | weeklySeries | (cells, mode, meta) -> series |
| alarm_logic.js | buildBaseline, classify, findCriticalPeriods, alarmKpis | series -> baseline -> states -> critical periods -> KPIs |
| calendar_view.js | render | (container, series, states) -> draws the calendar |
| report_view.js | render | (container, validation, meta) -> draws the report |
| main.js | start | wires all of the above |

## How B works without waiting for A
B develops against web/public/data_sample/ (fake, tiny, valid contract). Set web.use_sample_data to true.
When A's real files exist in web/public/data/, set it to false. B may ask the AI to generate a LARGER fake
sample (still in data_sample/) to test the baseline logic.
