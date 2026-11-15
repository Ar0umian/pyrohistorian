# Presentation plan

AI disclosure: written with help from Claude (Anthropic); reviewed by the team.
This is a live presentation with a live demo. Adjust the timings to the official time limit (the plan below is for about 5 minutes).
Every number on the slides comes from `node tests/evaluate_triage.mjs` and `python3 pipeline/run_all.py`. If a number on screen differs from
the script, the script is wrong: fix the script.

## Timing (5 minutes)

| Time | Part |
|---|---|
| 0:00 to 0:40 | Slides 1 and 2: the problem |
| 0:40 to 1:10 | Slide 3: the idea |
| 1:10 to 1:40 | Slide 4: harmonized calendar and its check |
| 1:40 to 2:10 | Slide 5: the finding (faint signals) |
| 2:10 to 4:00 | **Live demo** |
| 4:00 to 4:40 | Slide 6: the price, the negative result and the limits |
| 4:40 to 5:00 | Slide 7: next steps and thanks |

For 10 minutes: spend the extra time on the live demo (pick a second, smaller area and show it recomputes) and on slide 6.
For 3 minutes: slides 1, 2, 5, a 60-second demo (only the slider and the week inspector), slide 6 limits in one sentence.

## Slides (7 plus backup)

### Slide 1. Title
- On the slide: PyroHistorian. "One calendar for two fire sensors, and a way to tell serious signals from faint ones." Team and NASA Space Apps 2026.
- Say: "NASA tracks fires with two sensors. We made them speak one language, and we made the more sensitive one easier to trust."

### Slide 2. The problem
- On the slide: MODIS (1 km pixels, since 2000) and VIIRS (375 m, since 2012). Big number: "7 to 8.6 times more detections". Two bullets: "False jump in the record in 2012" and "Faint alarms that may not need action".
- Say: "VIIRS is far more sensitive. In our region it counts seven to eight times more detections in the same weeks. That breaks the long record, and it makes every faint signal a possible trigger for action."

### Slide 3. The idea
- On the slide: a simple diagram: NASA FIRMS files, pipeline, three small JSON files, browser. Below it two boxes: "1. Harmonize" and "2. Triage". Footer: "Runs in the browser. No server, no AI model at run time."
- Say: "First we put both sensors on one scale. Then we let the user decide which VIIRS signals deserve action, and we use the other sensor only as an independent check."

### Slide 4. Harmonized calendar
- On the slide: a screenshot of the calendar with hatched rows. Two lines: "MODIS converted with a monthly ratio, low to high range" and "Leave-one-year-out: real value inside the range in 86% of cases".
- Say: "Hatched weeks are converted, so they are uncertain. We tested the conversion by leaving one year out: eighty-six percent inside the range. That is about what a min to max range should give, so it tells us the range is honest, not that the model is perfect."

### Slide 5. The finding
- On the slide: five bars: 1 detection 14%, 2 detections 24%, 3 to 5 37%, 6 to 10 56%, more than 10 89%. Title: "How often MODIS also sees a VIIRS signal".
- Say: "A signal is one grid cell in one week. When VIIRS counts one detection, MODIS also sees that cell fourteen percent of the time. With more than ten detections, eighty-nine percent. The noise of a very sensitive sensor lives in the faint signals."

### LIVE DEMO (see the demo script below)

### Slide 6. The price, the negative result and the limits
- On the slide, three columns:
  - "At 5 detections": 29% less work. The share of the list also seen by MODIS 65% to 81%. 90% of confirmed signals kept. Price: 24% of removed signals were seen by MODIS.
  - "Negative result": richer score (neighbours, continuity) AUC 0.869, strength alone 0.875. We kept the simple rule.
  - "Limits": no ground truth; "not confirmed" is not "false"; one region; retrospective alarms; no validation before 2012.
- Say: "Every threshold has a price, and the operator chooses it. We also tried a richer score and it did not beat strength alone, so we kept the simple rule. And we want to be clear: there is no ground truth. Seen by MODIS is indirect evidence. The tool lowers priority and never deletes a signal."

### Slide 7. Next steps and thanks
- On the slide: "Check against burned-area data or incident records", "Use fire radiative power and detection time", "Prepare for the end of MODIS: the rule needs VIIRS only", "More regions". Then the acknowledgement of NASA FIRMS, the repository link, and the live page link.
- Say: "Next we want to check against independent fire evidence, use more information per detection, and prepare for the end of MODIS, which is why our rule needs only VIIRS. All data comes from NASA FIRMS. Thank you."

### Backup slides (not shown, only for questions)
- B1. Pipeline and data contract (the diagram in README).
- B2. The AUC table (raw strength 0.875, strength groups 0.856, plus neighbours 0.868, plus continuity 0.862, all three 0.869; later years 0.860 and 0.857).
- B3. The threshold table (thresholds 2, 3, 5, 8, 10).
- B4. Data sources and record counts (docs/DATA_SOURCES.md).
- B5. Validation by month (the table in the page's "Validation and method" section).

## Live demo script (about 2 minutes)

Before you start (do this before the session):
1. Start the server in the project root: `python3 -m http.server 8000`. Open http://localhost:8000/web/index.html in a clean browser window.
2. Hard refresh (Cmd+Shift+R) and zoom the browser to about 125%.
3. Close other tabs and turn off notifications.
4. Rehearse once and remember where the slider and the "Busiest week" button are.

Steps:
1. **Pick the area** (10 seconds). Move the pointer over the bright part of the map, choose 3 degrees, and click.
   Say: "We pick an area. Everything is computed in the browser, for these cells."
2. **Trust bars** (15 seconds). Point at the bars under the curve.
   Say: "This is the finding from the slide, for this area."
3. **The slider** (40 seconds). Move it slowly from 1 to 5, pause, then to 10, then back to 5. Read the numbers as they appear on screen.
   Say: "At five detections: less work, a cleaner list, most confirmed signals kept. The orange dot on the curve is our choice. Here is the price: signals we removed that MODIS did see."
4. **Week inspector** (30 seconds). Press "Busiest week", then drag the week slider a little. Point at the map colours.
   Say: "Red and amber are on the emergency list, amber meaning VIIRS only. Grey is low priority. A red outline on grey is the risk: below our threshold, but MODIS saw it. Blue is MODIS only."
5. **Alarm cards** (25 seconds). Scroll to the right column, open one card, and move the slider again so the green line changes.
   Say: "Alarms use a seasonal baseline and hysteresis, ideas borrowed from industrial alarm management. Each card shows the evidence and how many VIIRS signals in its weeks are on the emergency list."

Do not say: "accuracy", "the correct threshold is 5", or "tested with fire managers". Say: "seen by the second sensor", "you choose", "we have not tested it with operators".

Plan B:
- **Map tiles do not load:** the cells still draw on a blank background. Say: "the map tiles need internet; the analysis does not".
- **The page does not load at all:** switch to the backup screenshots (`docs/screenshots/`) in the backup slides and continue the story.
- **A number on screen differs from the slide:** say the number on screen and move on. Do not try to explain it live.

## Questions you may get (honest answers)

**Is "seen by MODIS" the same as "real"?** No. There is no ground truth in this project. A small real fire can be below MODIS's detection limit, so "not confirmed" does not mean "false". It also depends on fire size: big fires are seen by both. That is why the tool lowers priority and never deletes a signal.

**Is the check circular?** The rule uses VIIRS only (strength of the signal). MODIS is used only afterwards to evaluate what the rule does. But the confirmation is related to fire size, so we call it "confirmed by a second sensor", not "accuracy".

**Why 5?** It is a starting value, not a recommendation. The point is that the operator chooses and sees the price of the choice.

**Why not use the confidence flag already in the FIRMS data?** We already remove VIIRS low confidence (we keep nominal and high). We did not compare our rule against the confidence flag: this is something we have not done and would be a good next step.

**Is 86% good?** With 14 to 15 years, a min to max range is expected to contain a left-out year about (n minus 1) over (n plus 1) of the time, around 87%. So 86% is what the method should give. It shows the range is honest, not that the model is exact. The range is wide in some months.

**What happens when MODIS stops?** The rule needs VIIRS only, so it can keep running. But the threshold was studied with MODIS as the check, so it should be re-checked with other evidence. We would use burned-area data.

**Why harmonize if the triage uses VIIRS only?** The harmonized series gives the long record (2000 to 2011 has MODIS only), and the alarms are built on it. The triage works on the years with both sensors.

**Does it work in other regions?** We tested one region only (10 x 10 degrees in northern Australia). We do not know.

**Did you test it with real users?** No. We have not tested it with fire managers or operators.

**Where is the AI?** AI assistants helped write the code and the documents, and the team reviewed them. No AI model runs in the page: the text of the alarm cards is built from numbers with fixed rules.

**What about the industrial-control part?** The alarm ideas (seasonal baseline, hysteresis, nuisance alarms, redundant sensors) are borrowed methods. PyroHistorian is not a control system, it never sends commands, and the alarms are historical.

**Why 0.25 degree cells?** A compromise for file size and speed. A cell is about 28 km, much coarser than the pixels.

## Checklist for the day
- [ ] Slides exported to PDF and saved on the laptop and on a phone or USB drive
- [ ] Server command ready, and the page tested the same morning
- [ ] The area for the demo chosen and rehearsed; screenshots in `docs/screenshots/`
- [ ] Rehearsed twice with a stopwatch; the timings above kept
- [ ] Who says what is agreed (TODO: write the names next to each slide)
- [ ] The laptop is charged and the screen resolution is tested on the projector if possible
