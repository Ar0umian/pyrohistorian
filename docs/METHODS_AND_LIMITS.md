# Methods and limits

AI disclosure: written with help from Claude (Anthropic); reviewed by the team.
All numbers below come from the current region (10 x 10 degrees in northern Australia) and the data described in `DATA_SOURCES.md`.
They can be reproduced with `python3 pipeline/run_all.py` and `node tests/evaluate_triage.mjs`.

## 1. The problem

MODIS (about 1 km pixels, since 2000) and VIIRS (375 m pixels, since 2012) both report active fires, but VIIRS is much more
sensitive: in our data it counts about 7 to 8.6 times more detections than MODIS in the same weeks.
That creates two problems:

1. **The records do not line up.** A fire history that mixes the two sensors shows a false jump in 2012.
2. **The sensitive sensor raises many alarms that do not need action.** VIIRS picks up the faintest signals, and every
   detection can trigger a response. Which of them deserve action?

PyroHistorian answers both with data only: a harmonized burning-activity calendar (sections 3 to 5) and an interactive signal
triage (section 6).

## 2. Pipeline (`pipeline/`, run with `run_all.py`)

All settings are read from `shared/project_config.json`. The web app only reads the three JSON files in `web/public/data/`.

1. **Ingest.** Reads the FIRMS archive files and the near-real-time (NRT) files. NRT records are used only for days after the
   archive ends (`nrt_policy: only_after_archive_end`). Records are cleaned of duplicates and limited to the years in the config.
2. **Filters.** Only the Aqua satellite for MODIS. Fire type 0 (presumed vegetation fire). MODIS confidence 30 or more. VIIRS
   confidence nominal or high (low confidence is removed). Each step prints how many records it removes.
3. **Coverage.** The coverage of each sensor is its operating dates intersected with the dates present in the data.
4. **Weekly grid.** Detections are counted per grid cell (0.25 degrees) and per week (`week = min(52, (day_of_year - 1) // 7 + 1)`).
   A sensor's value is missing (NaN) if the whole week is not inside its coverage. Only rows with a detection are kept: an absent
   row means zero detections inside the coverage.
5. **Conversion model.** For each region and month, the ratio `sum(VIIRS) / sum(MODIS)` is computed for each overlap year
   (weeks where both sensors cover, from 2012, MODIS total of at least 10). The median, minimum and maximum over the years
   (at least 5 years) give the conversion. Where VIIRS exists, its measured count is used. Otherwise
   `harmonized = MODIS x median ratio`, with `low = MODIS x min ratio` and `high = MODIS x max ratio`.
   The monthly median ratios are between 6.8 and 8.6 in our data.
6. **Quality codes.** `G` measured by VIIRS, `U` converted from MODIS (with a range), `B` missing.
7. **Validation (leave one year out).** For each overlap year, the ratios are estimated without it and used to predict that
   year's monthly VIIRS total from MODIS. Result on 172 region-month-year cases: the real VIIRS total was inside the low to high
   range in **86%** of cases, and the mean absolute error was **2,426 detections** per monthly total. The error is large in May
   (about 6,000) because one year has a very low ratio (0.24).
   *How to read it:* with 14 to 15 years, a min to max range is expected to contain the left-out year about
   (n - 1) / (n + 1), around 87%, of the time. So 86% is what the method should give, not proof of a good model. The range is
   a min to max range, not a statistical confidence interval, and it is wide in some months.
8. **Export and contract check.** Writes `meta.json`, `cells_weekly.json` and `validation.json` (contract version 3,
   see `DATA_CONTRACT.md`) and checks them against the config.

## 3. Alarms on the harmonized series (`web/src/alarm_logic.js`)

The alarm ideas are borrowed from industrial alarm management (see `ICS_MAPPING.md`). They are methods, not a control system.

- **Seasonal baseline.** For each week of the year, the 90th (Elevated) and 97.5th (Alarm) percentiles of the same week in the
  OTHER years. A year needs at least 3 other years with data (a constant in the code, not in the config: to verify).
- **Minimum weekly count.** No Elevated or Alarm state below 5 detections per week.
- **Hysteresis.** A new state must hold for `hysteresis_weeks` (1) weeks before the state changes. It is applied to the weekly
  total of the selected area, never to single detections.
- **Critical period.** The Alarm state for 2 or more weeks in a row.

The baseline uses all other years, including later ones. The alarms are therefore a **retrospective** "unusual compared with this
area's own history", not a forecast and not a live warning.

## 4. The selected area

The user draws a rectangle on the map. Weekly totals, baseline and alarms are recomputed for the cells whose centre is inside it.

## 5. The calendar

One row per year, one column per week. Colours show the state (grey Normal, amber Elevated, red Alarm). Hatching marks weeks
converted from MODIS (uncertain). Light cells are missing weeks.

## 6. Signal triage (`web/src/referee.js`, `web/src/triage_console.js`)

**Idea.** A VIIRS signal is one grid cell in one week with at least one VIIRS detection, in a week watched by both sensors
(102,628 signals in the current region). The user chooses how strong a VIIRS signal must be (detections in that cell and week)
to reach the emergency list. The rule uses VIIRS only, so it still works after MODIS stops operating. MODIS is used only as an
**independent check**: was the same cell also seen by MODIS in the same week? ("Confirmed" below means that.)

**Result 1: faint signals are rarely confirmed.**

| VIIRS detections in the cell-week | Cell-weeks | Also seen by MODIS |
|---|---|---|
| 1 | 11,516 | 14% |
| 2 | 7,827 | 24% |
| 3 to 5 | 13,606 | 37% |
| 6 to 10 | 12,744 | 56% |
| more than 10 | 56,935 | 89% |

The same pattern appears in a small 3 x 3 degree sub-area (13% to 90%).

**Result 2: what a threshold does.**

| Threshold | On the list | Less work | List also seen by MODIS | Confirmed signals kept | Removed but seen by MODIS |
|---|---|---|---|---|---|
| keep all | 102,628 | 0% | 65% | 100% | - |
| 2 or more | 91,112 | 11% | 71% | 98% | 14% |
| 3 or more | 83,285 | 19% | 76% | 95% | 18% |
| 5 or more | 73,289 | 29% | 81% | 90% | 24% |
| 8 or more | 63,671 | 38% | 86% | 83% | 30% |
| 10 or more | 58,970 | 43% | 88% | 79% | 33% |

Every threshold has a price: some removed signals were confirmed. The console shows this price live, and the user decides.
The starting value of 5 is a placeholder, not a recommendation.

**Result 3 (negative): a richer score did not beat strength alone.** We tried a credibility score learned from the history
(strength group, number of active neighbour cells, continuity from the week before or after), scored with leave-one-year-out.
Separation of confirmed from unconfirmed signals (AUC, 0.5 means no information):

| Score | AUC |
|---|---|
| raw strength | **0.875** |
| strength groups | 0.856 |
| + neighbours | 0.868 |
| + continuity | 0.862 |
| all three | 0.869 |

Learned on years up to 2019 and tested on later years, raw strength gives 0.860 and the learned score 0.857. So we kept the
simple rule: one threshold on strength, with no fitted parameters. Neighbours and continuity help only a little because nearly
every signal has them (fires cluster and last). The experiment functions stay in `referee.js` and are not used in the interface.

**Alarm cards.** Each alarm episode shows how many VIIRS signals fall in its weeks and how many are on the emergency list at the
current threshold. The text of the cards is built from numbers with fixed rules. No AI model writes it when the page runs.

## 7. Limits

**What we can and cannot claim**

- **There is no ground truth.** "Seen by MODIS" is indirect evidence, not accuracy. A real small fire can be below MODIS's
  detection limit, so "not confirmed" does not mean "false". The tool lowers priority, it does not delete anything.
- **Confirmation is related to fire size.** Bigger fires are seen by both sensors. What we measure is "strong enough for a
  coarser sensor", which is close to "serious" but not the same thing.
- **The conversion is not validated before 2012.** There is no VIIRS then, so the leave-one-year-out test only covers the overlap
  years. Applying the ratio to 2000 to 2011 assumes the relation between the sensors was the same.
- **Only one region** (10 x 10 degrees, northern Australia) and one fire season pattern. Results can differ elsewhere.

**Choices that shape the numbers**

- Only Aqua (MODIS) and S-NPP (VIIRS) are used. Terra and NOAA-20 are not.
- Counts are per 0.25 degree cell (about 28 km), much coarser than the pixels. One cell-week mixes many detections.
- Weeks that are only partly inside a sensor's coverage are treated as missing for that sensor.
- The monthly ratio is a single number per region and month. It varies between years (in some months from 0.24 to 15.8), so the
  low to high range is wide.
- NRT data (preliminary processing) are used after the archive ends (from 2026-07-01).
- Starting values that are not in the config and are placeholders: the minimum of 3 other years for a baseline, the "faint"
  limit of 2 detections, and the starting threshold of 5.
- "Neighbour" and "continuity" are computed on the same 0.25 degree grid and weekly time step.

**Other**

- The alarms are historical and retrospective, not live. PyroHistorian never sends commands and does not control anything.
- The names of the industrial ideas in `ICS_MAPPING.md` (for example ISA-18.2, EEMUA 191) are inspirations: verify them before citing.
- The web page needs internet for the map library and map tiles.

## 8. Next steps

- **Check against independent fire evidence** such as a burned-area product (for example MCD64A1) or official incident records.
  This is what would turn "confirmed by a second sensor" into a measured accuracy.
- **Use more per-detection information** (fire radiative power, day or night, detection time) in the triage. This needs the
  pipeline to carry more fields (a new contract version).
- **Add NOAA-20** as another VIIRS view of the same cells.
- **Plan for the end of MODIS.** The VIIRS-only rule is designed for this, but its threshold should be re-checked with newer
  evidence (check NASA's announced dates for the end of MODIS).
- More regions and a region chooser.
