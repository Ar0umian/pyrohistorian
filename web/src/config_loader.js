// AI disclosure: written with help from Claude (Anthropic); reviewed by Owner B.
// Loads the config + the 3 JSON files, checks them, shows readable errors on the page.

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Could not load " + url + " (HTTP " + r.status + ")");
  return r.json();
}

// Show a readable error on the page instead of a blank screen.
export function showError(message) {
  let box = document.getElementById("app-error");
  if (!box) {
    box = document.createElement("div");
    box.id = "app-error";
    document.body.prepend(box);
  }
  box.style.cssText = "background:#fdecea;color:#7a1c14;padding:12px;margin:8px;border:1px solid #d32f2f";
  box.textContent = "Error: " + message;
}

// Throw if any key is missing from obj.
function need(obj, keys, where) {
  keys.forEach(function (k) {
    if (obj === null || obj === undefined || obj[k] === undefined) {
      throw new Error(where + ' is missing "' + k + '"');
    }
  });
}

export async function loadAll() {
  try {
    const config = await getJson("../shared/project_config.json");
    need(config, ["contract_version", "time", "regions", "paths", "files", "schema", "alarm", "ui", "quality_codes"], "project_config.json");
    need(config.paths, ["web_data_dir"], "config.paths");
    need(config.files, ["meta", "cells", "validation"], "config.files");

    // The real files written by Owner A (pipeline/run_all.py).
    const base = "../" + config.paths.web_data_dir + "/";   // relative to web/index.html, so it also works from a sub-folder URL
    const meta = await getJson(base + config.files.meta);
    const cellsRaw = await getJson(base + config.files.cells);
    const valRaw = await getJson(base + config.files.validation);

    if (meta.contract_version !== config.contract_version) {
      throw new Error("contract_version mismatch: config=" + config.contract_version + ", meta.json=" + meta.contract_version);
    }
    need(meta, ["coverage"], "meta.json");
    need(meta.coverage, ["legacy", "new"], "meta.coverage");

    // The contract: an object {contract_version, value_fields, absent_means, cells: [...]}.
    need(cellsRaw, ["contract_version", "value_fields", "cells"], "cells_weekly.json");
    if (cellsRaw.contract_version !== config.contract_version) {
      throw new Error("contract_version mismatch: config=" + config.contract_version + ", cells_weekly.json=" + cellsRaw.contract_version);
    }
    if (JSON.stringify(cellsRaw.value_fields) !== JSON.stringify(config.schema.cells_weekly.value_fields)) {
      throw new Error("cells_weekly.json value_fields differ from config.schema.cells_weekly.value_fields");
    }
    const cells = cellsRaw.cells;
    if (!Array.isArray(cells)) throw new Error("cells_weekly.json: cells must be a list");
    cells.forEach(function (c, i) { need(c, config.schema.cells_weekly.cell_fields, "cell #" + i); });

    // The contract: an object {contract_version, rows: [...]}.
    need(valRaw, ["contract_version", "rows"], "validation.json");
    if (valRaw.contract_version !== config.contract_version) {
      throw new Error("contract_version mismatch: config=" + config.contract_version + ", validation.json=" + valRaw.contract_version);
    }
    const validation = valRaw.rows;
    if (!Array.isArray(validation)) throw new Error("validation.json: rows must be a list");
    validation.forEach(function (r, i) { need(r, config.schema.validation.fields, "validation row #" + i); });

    return { config: config, meta: meta, cells: cells, validation: validation };
  } catch (e) {
    showError(e.message);
    throw e;
  }
}