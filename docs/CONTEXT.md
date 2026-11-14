# Context (attach/paste this FIRST in every AI chat, with shared/project_config.json and docs/INTERFACES.md)

Project: PyroHistorian. NASA Space Apps 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots".
Web app that harmonizes the MODIS and VIIRS fire records into one burning-activity calendar for a
user-selected area. MODIS counts are converted to the VIIRS scale using the overlap years, with a
low/high range. Each cell-week has a quality code (G measured, U converted, B missing).
Alarm ideas borrowed from industrial control (seasonal baseline, hysteresis); these are borrowed
methods, not a control system.

Architecture: offline Python pipeline (Owner A) -> 3 static JSON files -> browser-only app (Owner B).
The two never talk except through shared/project_config.json and the 3 JSON files.

## Prompt template (copy, fill the two <...>)
I am Owner <A or B>. Read the attached CONTEXT.md, project_config.json and INTERFACES.md.
Write ONLY the file <exact path from OWNERS.md>. Implement ONLY the functions listed for that file in
INTERFACES.md, with exactly those names, inputs and outputs. Do NOT write, rename or modify any other
file, and do not invent extra files. Read every path, value and field name from project_config.json;
never hardcode them. Keep the code simple and commented for beginners, put the AI disclosure line at the
top, and tell me anything I must verify. If something you need is missing, ask me instead of guessing.

## Rules
- One chat = one file. Give the AI only the file name you own.
- Never paste the other person's code into your chat and ask for "the same thing".
- Paste errors into the same chat; ask for a plain-language explanation first, then the fix.
- Gemini is the fallback only when Claude is stuck or unavailable.
- Run commands from the project root. Serve the web app from the project root: python3 -m http.server 8000
  and open http://localhost:8000/web/index.html
