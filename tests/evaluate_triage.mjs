// AI disclosure: written with help from Claude (Anthropic); must be reviewed by the team.
// Reproduces the numbers of the signal triage evaluation from the real data files in web/public/data.
// Run from the project root:   node tests/evaluate_triage.mjs
// (web/package.json says "type": "module", so Node can load the browser modules.)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildEvidence, buildSignals, sensorProfile, evaluate, looCredibility, trainCredibility, applyCredibility, auc, ALL_FEATURES } from "../web/src/referee.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); }
const config = load("shared/project_config.json");
const dir = config.paths.web_data_dir + "/";
const meta = load(dir + config.files.meta);
const cells = load(dir + config.files.cells).cells;

function pct(x) { return x === null ? "-" : Math.round(x * 100) + "%"; }
function a3(x) { return x === null ? "-" : x.toFixed(3); }

const evidence = buildEvidence(cells, meta, config);
const signals = buildSignals(evidence);
console.log("Cells:", cells.length, "| signals (VIIRS-active cell-weeks in weeks watched by both sensors):", signals.length);

console.log("\n1) How often MODIS also sees a VIIRS signal, by signal strength (detections per cell-week)");
sensorProfile(evidence).byStrength.forEach(function (b) {
  console.log("   " + b.label.padEnd(5), String(b.cellWeeks).padStart(8), "cell-weeks ->", pct(b.rate));
});

console.log("\n2) How well does a score separate MODIS-confirmed signals? (AUC: 0.5 = no information, 1 = perfect)");
console.log("   raw strength                        ", a3(auc(signals, signals.map(function (s) { return s.nw; }))));
console.log("   credibility, all VIIRS features (leave-one-year-out)", a3(auc(signals, looCredibility(signals, ALL_FEATURES))));
const train = signals.filter(function (s) { return s.year <= 2019; });
const test = signals.filter(function (s) { return s.year > 2019; });
const table = trainCredibility(train, ALL_FEATURES);
console.log("   later years only (train <= 2019, test > 2019): raw strength",
  a3(auc(test, test.map(function (s) { return s.nw; }))), "| credibility", a3(auc(test, applyCredibility(test, table, ALL_FEATURES))));

console.log("\n3) What a strength threshold does");
console.log("threshold".padEnd(12) + "on list".padStart(9) + "less work".padStart(11) + "list seen".padStart(11) + "kept".padStart(8) + "dropped seen".padStart(14));
[1, 2, 3, 5, 8, 10].forEach(function (t) {
  const e = evaluate(signals, { minStrength: t, minNeighbours: 0, keepPersistent: false });
  console.log((">= " + t).padEnd(12) + String(e.kept).padStart(9) + pct(e.loadCut).padStart(11) + pct(e.keptConfirmShare).padStart(11) + pct(e.retained).padStart(8) + pct(e.droppedConfirmShare).padStart(14));
});
console.log("\nless work = share of signals taken off the emergency list | list seen = share of the list that MODIS also saw");
console.log("kept = share of all MODIS-confirmed signals still on the list | dropped seen = share of removed signals that MODIS saw");
