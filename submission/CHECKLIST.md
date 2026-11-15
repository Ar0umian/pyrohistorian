# Pre-submission checklist

AI disclosure: written with help from Claude (Anthropic); reviewed by the team.
Tick each item only after you checked it yourself.

## Repository
- [ ] The repository is public and the link opens without logging in
- [ ] `git status` is clean and everything is pushed
- [ ] `web/public/data/` is committed (`git ls-files web/public/data` lists 3 files)
- [ ] No raw data or backups in the repository (`data/raw`, `data/interim` are in `.gitignore`)
- [ ] A `LICENSE` file exists (README no longer says TODO)

## Run test (a fresh copy, as the judges will see it)
- [ ] `git clone <repo url> /tmp/pyro_test` then `cd /tmp/pyro_test && python3 -m http.server 8002`
- [ ] http://localhost:8002/web/index.html opens, the map shows, a selected area gives the triage, the calendar and the alarm cards
- [ ] No red error box on the page and no red errors in the browser console
- [ ] If the page is published online (for example GitHub Pages), the same test works from that link
- [ ] With the internet turned off, the page still opens and the analysis works (only the map tiles are missing)

## Data and numbers
- [ ] `python3 pipeline/run_all.py` ends with exit code 0 (contract check OK)
- [ ] `node tests/evaluate_triage.mjs` prints the numbers written in README, METHODS_AND_LIMITS and the slides
- [ ] The region has a real name (not CHANGE_ME) in `shared/project_config.json` and in `meta.json`

## Documents
- [ ] README: team, license, links and screenshots are filled in (no TODO left: `grep -rn TODO README.md docs`)
- [ ] `docs/METHODS_AND_LIMITS.md` read once by every team member
- [ ] The acknowledgement text matches NASA's current requirement
- [ ] AI disclosure line at the top of every source file and document (`grep -L "AI disclosure" pipeline/*.py web/src/*.js`)

## Honesty
- [ ] Nowhere is "accuracy" claimed for the triage: it says "seen by MODIS", "confirmed by the second sensor"
- [ ] The limits (no ground truth, one region, retrospective alarms, no validation before 2012) are on the slides and in README
- [ ] No sentence says the tool was tested with fire managers (it was not)

## Presentation
- [ ] The official rules and the submission form were read again: is a video or a recording required? (If yes, record the live demo part of `docs/PRESENTATION.md`)
- [ ] Slides finished from `docs/PRESENTATION.md`; every number on a slide matches the screen and the evaluation script
- [ ] Slides exported to PDF; copies on the laptop and on a phone or USB drive
- [ ] Rehearsed twice with a stopwatch, inside the time limit; who says what is agreed
- [ ] Live demo rehearsed on the machine and screen that will be used; plan B ready (screenshots in `docs/screenshots/`)

## Submission
- [ ] Official Space Apps 2026 rules and form fields read again (fields, length limits, team size, license)
- [ ] Submission text pasted from `docs/SUBMISSION_TEXT.md` and shortened if needed
- [ ] Links in README and the form checked by opening them in a private window
- [ ] Submitted before the deadline, with a confirmation saved
