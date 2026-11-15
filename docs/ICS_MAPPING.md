# ICS mapping (industrial control ideas -> PyroHistorian)

AI disclosure: written with help from Claude (Anthropic); reviewed by the team.

These are borrowed METHODS. PyroHistorian is not a control system and does not control anything.
Terms are inspired by industrial alarm management (for example ISA-18.2 / EEMUA 191): please verify the names before citing them.

| Industrial control idea | What it means there | Where we use it | Where in the code or config |
|---|---|---|---|
| Alarm setpoint / limit | Value above which an alarm is raised | Weekly percentile limits | alarm.elevated_percentile, alarm.alarm_percentile |
| Seasonal baseline | Expected normal level for this time of the cycle | Percentile per week of the year, built from the OTHER years | alarm_logic.js buildBaseline |
| Noise floor / minimum limit | Ignore tiny signals | No alarm below a minimum weekly count | alarm.min_abs_weekly_count |
| Hysteresis / deadband | A state changes only after the signal stays across the limit | State changes only after N weeks in a row | alarm.hysteresis_weeks |
| Chattering alarm | Alarm that switches on and off repeatedly | KPI: Alarm restarts after a short gap | alarm.critical_min_weeks (used as the gap) |
| Standing (stale) alarm | Alarm that stays active a long time | Longest run of Alarm weeks | alarm_logic.js alarmKpis |
| Alarm states | Normal / abnormal levels | Normal, Elevated, Alarm | alarm.states, ui.state_colors |
| Data quality flag | Good / uncertain / bad value | G measured, U converted, B missing | quality_codes |
| Nuisance alarm | An alarm that does not need an operator action | Faint VIIRS signals that no second sensor confirms | referee.js, triage_console.js |
| Alarm rationalization (prioritization) | Decide which alarms deserve attention | The strength threshold of the signal triage | triage_console.js slider |
| Redundant sensors / voting | Several sensors measure the same thing; agreement raises confidence | MODIS used as an independent check of VIIRS signals | referee.js buildSignals, evaluate |
| Sensor calibration and drift | Keep two instruments on the same scale | Monthly MODIS to VIIRS ratio from the overlap years | conversion_model.py |
| Operator decision (human in the loop) | A person decides; the system advises | The user chooses the threshold; nothing is sent anywhere | whole web app |

Rules we follow:
- Hysteresis is applied to the WEEKLY aggregate, never to raw detections.
- Normal is shown in grey; colour is used only for abnormal states.
- Converted values (q = U) are drawn hatched, because they are uncertain.
- "Not confirmed" is not "false": the triage lowers priority and never deletes a signal.
