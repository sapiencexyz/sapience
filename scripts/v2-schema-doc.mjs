#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(REPO_ROOT, "packages/api/package.json"));
const { buildSchema } = require("graphql");

const SDL_PATH = resolve(REPO_ROOT, "packages/api/src/graphql/v2/schema/schema.graphql");
const OUT_PATH = process.argv[2] ?? "/Users/noah/Desktop/v2-graphql-schema.html";

const sdl = readFileSync(SDL_PATH, "utf8");
const schema = buildSchema(sdl);
const typeMap = schema.getTypeMap();

const isInternal = (n) => n.startsWith("__");
const types = Object.values(typeMap)
  .filter((t) => !isInternal(t.name))
  .filter((t) => !["String", "Int", "Float", "Boolean", "ID"].includes(t.name));

const Query = typeMap.Query;

const groupBy = (arr, fn) => {
  const out = {};
  for (const x of arr) {
    const k = fn(x);
    (out[k] ??= []).push(x);
  }
  return out;
};

const kindOf = (t) => {
  const c = t.constructor.name;
  if (c.includes("GraphQLScalar")) return "Scalar";
  if (c.includes("GraphQLEnum")) return "Enum";
  if (c.includes("GraphQLInputObject")) return "Input";
  if (c.includes("GraphQLObject")) return "Object";
  if (c.includes("GraphQLInterface")) return "Interface";
  if (c.includes("GraphQLUnion")) return "Union";
  return "Other";
};

const slug = (s) => s.replace(/[^a-zA-Z0-9_-]/g, "-");

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Render a type ref with hyperlinks for named types.
const renderTypeRef = (t) => {
  // Walk wrappers.
  const wrappers = [];
  let cur = t;
  while (cur && (cur.ofType || cur.constructor.name.includes("NonNull") || cur.constructor.name.includes("List"))) {
    if (cur.constructor.name.includes("NonNull")) wrappers.push("!");
    else if (cur.constructor.name.includes("List")) wrappers.push("[]");
    cur = cur.ofType;
  }
  // Build from inside out.
  let s = `<a href="#type-${slug(cur.name)}">${esc(cur.name)}</a>`;
  // Apply wrappers in reverse to reconstruct list/nonnull.
  // The wrappers array was pushed outside-in; reverse to apply inside-out.
  for (const w of wrappers.reverse()) {
    if (w === "!") s = `${s}!`;
    else s = `[${s}]`;
  }
  return s;
};

const renderDescription = (d) => {
  if (!d) return "";
  return `<div class="desc">${esc(d).replace(/\n/g, "<br>")}</div>`;
};

const renderArg = (a) => {
  const def = a.defaultValue !== undefined ? ` <span class="default">= ${esc(JSON.stringify(a.defaultValue))}</span>` : "";
  return `<li class="arg"><code class="name">${esc(a.name)}</code>: ${renderTypeRef(a.type)}${def}${renderDescription(a.description)}</li>`;
};

const renderField = (f) => {
  const args = f.args && f.args.length
    ? `<ul class="args">${f.args.map(renderArg).join("")}</ul>`
    : "";
  return `
    <div class="field">
      <div class="field-head">
        <code class="name">${esc(f.name)}</code>${args ? "(...)" : ""}: ${renderTypeRef(f.type)}
      </div>
      ${renderDescription(f.description)}
      ${args}
    </div>
  `;
};

const renderInputField = (f) => {
  const def = f.defaultValue !== undefined ? ` <span class="default">= ${esc(JSON.stringify(f.defaultValue))}</span>` : "";
  return `
    <div class="field">
      <div class="field-head">
        <code class="name">${esc(f.name)}</code>: ${renderTypeRef(f.type)}${def}
      </div>
      ${renderDescription(f.description)}
    </div>
  `;
};

const renderObject = (t) => {
  const fields = Object.values(t.getFields());
  const implementsIfaces = (t.getInterfaces?.() ?? [])
    .map((i) => renderTypeRef(i))
    .join(", ");
  return `
    <section class="type type-object" id="type-${slug(t.name)}">
      <h3><span class="kind-badge object">type</span> ${esc(t.name)}${implementsIfaces ? ` <span class="implements">implements ${implementsIfaces}</span>` : ""}</h3>
      ${renderDescription(t.description)}
      <div class="fields">${fields.map(renderField).join("")}</div>
    </section>
  `;
};

const renderInterface = (t) => {
  const fields = Object.values(t.getFields());
  return `
    <section class="type type-interface" id="type-${slug(t.name)}">
      <h3><span class="kind-badge interface">interface</span> ${esc(t.name)}</h3>
      ${renderDescription(t.description)}
      <div class="fields">${fields.map(renderField).join("")}</div>
    </section>
  `;
};

const renderInput = (t) => {
  const fields = Object.values(t.getFields());
  return `
    <section class="type type-input" id="type-${slug(t.name)}">
      <h3><span class="kind-badge input">input</span> ${esc(t.name)}</h3>
      ${renderDescription(t.description)}
      <div class="fields">${fields.map(renderInputField).join("")}</div>
    </section>
  `;
};

const renderEnum = (t) => {
  const values = t.getValues();
  return `
    <section class="type type-enum" id="type-${slug(t.name)}">
      <h3><span class="kind-badge enum">enum</span> ${esc(t.name)}</h3>
      ${renderDescription(t.description)}
      <div class="fields">
        ${values.map((v) => `
          <div class="field">
            <div class="field-head"><code class="name">${esc(v.name)}</code></div>
            ${renderDescription(v.description)}
          </div>
        `).join("")}
      </div>
    </section>
  `;
};

const renderScalar = (t) => `
  <section class="type type-scalar" id="type-${slug(t.name)}">
    <h3><span class="kind-badge scalar">scalar</span> ${esc(t.name)}</h3>
    ${renderDescription(t.description)}
  </section>
`;

const renderUnion = (t) => {
  const members = t.getTypes().map(renderTypeRef).join(" | ");
  return `
    <section class="type type-union" id="type-${slug(t.name)}">
      <h3><span class="kind-badge union">union</span> ${esc(t.name)}</h3>
      ${renderDescription(t.description)}
      <div class="union-members">= ${members}</div>
    </section>
  `;
};

const renderType = (t) => {
  switch (kindOf(t)) {
    case "Object": return renderObject(t);
    case "Interface": return renderInterface(t);
    case "Input": return renderInput(t);
    case "Enum": return renderEnum(t);
    case "Scalar": return renderScalar(t);
    case "Union": return renderUnion(t);
    default: return "";
  }
};

// Build sections.
const queryFields = Object.values(Query.getFields());

const otherTypes = types.filter((t) => t.name !== "Query");
const grouped = groupBy(otherTypes, kindOf);

const sectionOrder = ["Object", "Interface", "Union", "Input", "Enum", "Scalar"];
const sectionLabels = {
  Object: "Object Types",
  Interface: "Interfaces",
  Union: "Unions",
  Input: "Input / Filter Types",
  Enum: "Enums",
  Scalar: "Scalars",
};

const sortByName = (arr) => arr.slice().sort((a, b) => a.name.localeCompare(b.name));

const nav = `
  <nav class="sidebar">
    <div class="sidebar-head">v2 GraphQL schema</div>
    <input type="search" id="filter" placeholder="Filter…" />
    <details open><summary>Queries (${queryFields.length})</summary>
      <ul>${queryFields.map((f) => `<li><a href="#query-${slug(f.name)}"><code>${esc(f.name)}</code></a></li>`).join("")}</ul>
    </details>
    ${sectionOrder
      .filter((k) => grouped[k]?.length)
      .map((k) => `
        <details ${k === "Object" ? "open" : ""}><summary>${sectionLabels[k]} (${grouped[k].length})</summary>
          <ul>${sortByName(grouped[k])
            .map((t) => `<li><a href="#type-${slug(t.name)}"><code>${esc(t.name)}</code></a></li>`)
            .join("")}</ul>
        </details>
      `)
      .join("")}
  </nav>
`;

const queriesSection = `
  <section class="section">
    <h2 id="queries">Queries</h2>
    ${queryFields
      .map(
        (f) => `
      <section class="query" id="query-${slug(f.name)}">
        <h3><span class="kind-badge query">query</span> <code class="name">${esc(f.name)}</code>: ${renderTypeRef(f.type)}</h3>
        ${renderDescription(f.description)}
        ${f.args.length ? `<div class="args-block"><div class="args-label">Arguments</div><ul class="args">${f.args.map(renderArg).join("")}</ul></div>` : ""}
      </section>
    `,
      )
      .join("")}
  </section>
`;

const typeSections = sectionOrder
  .filter((k) => grouped[k]?.length)
  .map(
    (k) => `
    <section class="section">
      <h2 id="section-${k.toLowerCase()}">${sectionLabels[k]}</h2>
      ${sortByName(grouped[k]).map(renderType).join("")}
    </section>
  `,
  )
  .join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sapience v2 GraphQL — Schema Review</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --bg: #0e1117;
    --panel: #161b22;
    --panel-2: #1c232c;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent: #58a6ff;
    --green: #7ee787;
    --orange: #ffa657;
    --pink: #ff7b72;
    --purple: #d2a8ff;
    --yellow: #f2cc60;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    line-height: 1.55;
  }
  code, pre, .name {
    font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .layout { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }

  .sidebar {
    background: var(--panel);
    border-right: 1px solid var(--border);
    padding: 18px 14px;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .sidebar-head {
    font-weight: 600;
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 12px;
  }
  .sidebar input[type=search] {
    width: 100%;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 12px;
  }
  .sidebar details { margin-bottom: 6px; }
  .sidebar summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--muted);
    padding: 4px 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .sidebar ul { list-style: none; padding-left: 8px; margin: 4px 0 8px 0; }
  .sidebar li { padding: 2px 0; font-size: 13px; }
  .sidebar code { font-size: 12px; color: var(--text); }
  .sidebar a:hover code { color: var(--accent); }

  main { padding: 32px 40px 80px; max-width: 1100px; }

  h1 {
    font-size: 26px;
    margin: 0 0 6px 0;
    font-weight: 600;
  }
  .subtitle { color: var(--muted); margin-bottom: 28px; font-size: 14px; }

  .section { margin-top: 48px; }
  .section > h2 {
    font-size: 20px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
    margin-bottom: 24px;
  }

  .query, .type {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 16px;
  }
  .query h3, .type h3 {
    font-size: 16px;
    margin: 0 0 8px 0;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .implements { color: var(--muted); font-size: 13px; font-weight: 400; }

  .kind-badge {
    display: inline-block;
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    font-family: ui-monospace, monospace;
  }
  .kind-badge.query { background: rgba(88,166,255,0.15); color: var(--accent); }
  .kind-badge.object { background: rgba(126,231,135,0.15); color: var(--green); }
  .kind-badge.interface { background: rgba(210,168,255,0.15); color: var(--purple); }
  .kind-badge.input { background: rgba(255,166,87,0.15); color: var(--orange); }
  .kind-badge.enum { background: rgba(242,204,96,0.15); color: var(--yellow); }
  .kind-badge.scalar { background: rgba(139,148,158,0.18); color: var(--muted); }
  .kind-badge.union { background: rgba(255,123,114,0.15); color: var(--pink); }

  .desc {
    color: var(--muted);
    font-size: 13px;
    margin: 4px 0 8px;
    line-height: 1.55;
    border-left: 2px solid var(--border);
    padding-left: 10px;
    white-space: pre-line;
  }

  .args-block { margin-top: 10px; }
  .args-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }
  .args { list-style: none; padding-left: 14px; margin: 4px 0; border-left: 1px dashed var(--border); }
  .arg { margin: 6px 0; }
  .default { color: var(--muted); font-size: 12px; }

  .fields { margin-top: 6px; }
  .field {
    padding: 8px 10px;
    border-radius: 6px;
    margin-bottom: 4px;
  }
  .field:hover { background: var(--panel-2); }
  .field-head { font-size: 14px; }
  .field-head .name { color: var(--green); }
  .arg .name { color: var(--orange); }

  .union-members { font-family: ui-monospace, monospace; color: var(--muted); margin-top: 6px; }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
  }
  .meta { color: var(--muted); font-size: 12px; }

  /* hide elements not matching filter */
  .hidden { display: none !important; }
</style>
</head>
<body>
<div class="layout">
  ${nav}
  <main>
    <div class="topbar">
      <div>
        <h1>Sapience v2 GraphQL — Schema Review</h1>
        <div class="subtitle">Source: <code>packages/api/src/graphql/v2/schema/schema.graphql</code> &middot; ${queryFields.length} queries &middot; ${otherTypes.length} types</div>
      </div>
      <div class="meta">Generated ${new Date().toISOString()}</div>
    </div>
    ${queriesSection}
    ${typeSections}
  </main>
</div>
<script>
  const filter = document.getElementById('filter');
  const sections = document.querySelectorAll('.query, .type');
  const sidebarLinks = document.querySelectorAll('.sidebar li');
  filter?.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    sections.forEach((el) => {
      const text = el.textContent.toLowerCase();
      el.classList.toggle('hidden', q && !text.includes(q));
    });
    sidebarLinks.forEach((el) => {
      const text = el.textContent.toLowerCase();
      el.classList.toggle('hidden', q && !text.includes(q));
    });
  });
</script>
</body>
</html>
`;

writeFileSync(OUT_PATH, html);
console.log(`Wrote ${OUT_PATH}`);
