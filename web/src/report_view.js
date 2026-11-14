// AI disclosure: written with help from Claude (Anthropic); reviewed by Owner B.
// Shows validation rows, conversion ratios (meta.conversion) and the acknowledgement text.
// ASSUMPTION (verify with Owner A): meta.conversion is a list of rows or an object; meta.acknowledgement is text.

function makeTable(rows, columns) {
  const t = document.createElement("table");
  const h = t.insertRow();
  columns.forEach(function (c) { const th = document.createElement("th"); th.textContent = c; h.appendChild(th); });
  rows.forEach(function (r) {
    const tr = t.insertRow();
    columns.forEach(function (c) {
      const v = r[c];
      tr.insertCell().textContent = typeof v === "number" ? Math.round(v * 1000) / 1000 : (v === undefined ? "" : String(v));
    });
  });
  return t;
}

function section(container, title) {
  const h = document.createElement("h2");
  h.textContent = title;
  container.appendChild(h);
}

export function render(container, validation, meta, config) {
  container.textContent = "";

  section(container, "Validation (" + config.validation.method + ")");
  container.appendChild(makeTable(validation, config.schema.validation.fields));

  section(container, "Conversion ratios (legacy to new)");
  const conv = meta.conversion;
  if (Array.isArray(conv) && conv.length > 0) {
    container.appendChild(makeTable(conv, Object.keys(conv[0])));
  } else if (conv && typeof conv === "object") {
    const rows = Object.keys(conv).map(function (k) {
      return { name: k, value: typeof conv[k] === "object" ? JSON.stringify(conv[k]) : conv[k] };
    });
    container.appendChild(makeTable(rows, ["name", "value"]));
  } else {
    container.appendChild(document.createTextNode("No conversion information in meta.json."));
  }

  section(container, "Acknowledgement");
  const p = document.createElement("p");
  p.textContent = meta.acknowledgement || "(meta.acknowledgement is missing - ask Owner A or add the text.)";
  container.appendChild(p);
}