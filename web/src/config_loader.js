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
    const config = await getJson("/shared/project_config.json");
    need(config, ["contract_version", "time", "regions", "paths", "files", "schema", "alarm", "ui", "web", "quality_codes"], "project_config.json");
    need(config.paths, ["web_data_dir", "web_sample_dir"], "config.paths");
    need(config.files, ["meta", "cells", "validation"], "config.files");
    need(config.web, ["use_sample_data"], "config.web");

    // Sample data while Owner A's real files are not ready.
    const dir = config.web.use_sample_data ? config.paths.web_sample_dir : config.paths.web_data_dir;
    const base = "/" + dir + "/";
    const meta = await getJson(base + config.files.meta);
    const cellsRaw = await getJson(base + config.files.cells);
    const valRaw = await getJson(base + config.files.validation);

    if (meta.contract_version !== config.contract_version) {
      throw new Error("contract_version mismatch: config=" + config.contract_version + ", meta.json=" + meta.contract_version);
    }
    need(meta, ["coverage"], "meta.json");
    need(meta.coverage, ["legacy", "new"], "meta.coverage");

    // Accept either a plain list or an object holding the list.
    const cells = Array.isArray(cellsRaw) ? cellsRaw : cellsRaw.cells;
    if (!Array.isArray(cells)) throw new Error("cells file must be a list of cells");
    cells.forEach(function (c, i) { need(c, config.schema.cells_weekly.cell_fields, "cell #" + i); });

    const validation = Array.isArray(valRaw) ? valRaw : valRaw.rows;
    if (!Array.isArray(validation)) throw new Error("validation file must be a list of rows");
    validation.forEach(function (r, i) { need(r, config.schema.validation.fields, "validation row #" + i); });

    return { config: config, meta: meta, cells: cells, validation: validation };
  } catch (e) {
    showError(e.message);
    throw e;
  }
}