#!/usr/bin/env node

/** Generate freshness-checked API, plugin, and token references from source. */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const generatedDir = path.join(root, "docs/generated");
const repositoryUrl = "https://github.com/flytohub/flyto-plugins-js/blob/main/";

const htmlSummaries = {
  "plugins/form-builder/ui/index.html#init": "Load host props, initialize field defaults, and render the form.",
  "plugins/form-builder/ui/index.html#getAllFields": "Return the field definitions supplied by the workflow step.",
  "plugins/form-builder/ui/index.html#getWizardSteps": "Split fields into labeled wizard pages at step_break markers.",
  "plugins/form-builder/ui/index.html#getVisibleFields": "Filter a field list through each field's conditional rule.",
  "plugins/form-builder/ui/index.html#evaluateCondition": "Evaluate equality, comparison, containment, and empty-state conditions.",
  "plugins/form-builder/ui/index.html#validateField": "Apply required, length, range, pattern, and built-in type validation.",
  "plugins/form-builder/ui/index.html#validateCurrentFields": "Validate the visible fields on the active wizard page.",
  "plugins/form-builder/ui/index.html#validateAll": "Validate every currently visible input before final submission.",
  "plugins/form-builder/ui/index.html#handleSubmit": "Validate, normalize values and timing metadata, then submit through the bridge.",
  "plugins/form-builder/ui/index.html#handleCancel": "Cancel the active interaction through the bridge.",
  "plugins/form-builder/ui/index.html#render": "Render the selected form mode and bind its event handlers.",
  "plugins/form-builder/ui/index.html#renderCollectForm": "Build the collection form, wizard progress, fields, and actions.",
  "plugins/form-builder/ui/index.html#renderApprovalForm": "Build review context, optional fields, comment, and decision actions.",
  "plugins/form-builder/ui/index.html#renderFields": "Render structural and interactive field definitions with errors.",
  "plugins/form-builder/ui/index.html#renderFieldInput": "Dispatch one field definition to its matching input renderer.",
  "plugins/form-builder/ui/index.html#renderSelect": "Render a single-select trigger and option list.",
  "plugins/form-builder/ui/index.html#renderMultiSelect": "Render selected tags and a multi-select option list.",
  "plugins/form-builder/ui/index.html#renderRadio": "Render one radio option group.",
  "plugins/form-builder/ui/index.html#renderFileUpload": "Render the file drop target and selected-file summary.",
  "plugins/form-builder/ui/index.html#bindEvents": "Attach action, input, selection, file, and wizard interactions after rendering.",
  "plugins/form-builder/ui/index.html#handleFile": "Read one selected file as a data URL and retain its metadata.",
  "plugins/form-builder/ui/index.html#element": "Create one HTML element and assign its class and literal text without parsing markup.",
  "plugins/form-builder/ui/index.html#append": "Append the provided DOM children and return their parent node.",
  "plugins/form-builder/ui/index.html#button": "Create an inert button with an allowlisted action data property.",
  "plugins/form-builder/ui/index.html#requiredLabel": "Create a field label and optional required marker from text nodes.",
  "plugins/form-builder/ui/index.html#inputElement": "Create a typed form input and assign its field, value, and placeholder properties.",
  "plugins/form-builder/ui/index.html#formatSize": "Format a byte count as B, KB, or MB.",
  "plugins/image-crop/ui/index.html#init": "Load crop props, select the aspect ratio, and start image loading.",
  "plugins/image-crop/ui/index.html#setRatio": "Convert a ratio label into a numeric width-to-height constraint.",
  "plugins/image-crop/ui/index.html#loadImage": "Load a CORS-enabled image, fit it to the canvas, and initialize the crop.",
  "plugins/image-crop/ui/index.html#updateCropUI": "Position the crop overlay and report natural-pixel dimensions.",
  "plugins/image-crop/ui/index.html#clampCrop": "Keep crop dimensions and coordinates inside the displayed canvas.",
  "plugins/image-crop/ui/index.html#applyCropRatio": "Resize and clamp the crop rectangle to the selected aspect ratio.",
};

/** Recursively list production source files. */
function walk(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ["node_modules", "dist", "coverage"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(absolute));
    else result.push(absolute);
  }
  return result;
}

/** Convert a JSDoc comment representation to one compact sentence. */
function commentText(comment) {
  if (typeof comment === "string") return comment.trim().split(/\n\s*\n/)[0].replace(/\s+/g, " ");
  if (Array.isArray(comment)) return comment.map((part) => part.text || "").join("").trim();
  return "";
}

/** Return the first useful JSDoc summary attached to a declaration. */
function summaryFor(node) {
  const targets = [];
  let current = node;
  for (let depth = 0; current && depth < 4; depth += 1) {
    targets.push(current);
    current = current.parent;
  }
  for (const target of targets) {
    for (const doc of target?.jsDoc || []) {
      const summary = commentText(doc.comment);
      if (summary) return summary;
    }
  }
  return "";
}

/** Find the owning class, interface, or object variable for a method. */
function ownerName(node) {
  let current = node.parent;
  while (current) {
    if ((ts.isClassDeclaration(current) || ts.isInterfaceDeclaration(current)) && current.name) {
      return current.name.text;
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text;
    current = current.parent;
  }
  return "";
}

/** Build a concise declaration signature without implementation bodies. */
function signatureFor(node, source, name) {
  if (ts.isClassDeclaration(node)) return `class ${name}`;
  if (ts.isInterfaceDeclaration(node)) return `interface ${name}`;
  if (ts.isTypeAliasDeclaration(node)) {
    return node.getText(source).replace(/\s+/g, " ").slice(0, 220);
  }
  if (ts.isConstructorDeclaration(node)) {
    return `${name}(${node.parameters.map((item) => item.getText(source)).join(", ")})`;
  }
  if ("parameters" in node) {
    const parameters = node.parameters.map((item) => item.getText(source).replace(/\s+/g, " ")).join(", ");
    const returnType = node.type ? `: ${node.type.getText(source).replace(/\s+/g, " ")}` : "";
    return `${name}(${parameters})${returnType}`;
  }
  return name;
}

/** Collect named declarations from one TypeScript or JavaScript source unit. */
function collectDeclarations(relativePath, text, lineOffset = 0, summaryOverrides = {}) {
  const kind = relativePath.endsWith(".ts") || relativePath.endsWith(".d.ts")
    ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, kind);
  const declarations = [];

  function add(node, declarationKind, baseName) {
    const owner = ownerName(node);
    const name = owner && (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)
      || ts.isConstructorDeclaration(node))
      ? `${owner}.${baseName}` : baseName;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    const summary = summaryFor(node) || summaryOverrides[`${relativePath}#${baseName}`] || "";
    declarations.push({
      kind: declarationKind,
      name,
      signature: signatureFor(node, source, name),
      line: position.line + 1 + lineOffset,
      summary,
    });
  }

  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) add(node, "class", node.name.text);
    else if (ts.isInterfaceDeclaration(node) && node.name) add(node, "interface", node.name.text);
    else if (ts.isTypeAliasDeclaration(node)) add(node, "type", node.name.text);
    else if (ts.isFunctionDeclaration(node) && node.name) add(node, "function", node.name.text);
    else if (ts.isConstructorDeclaration(node)) add(node, "constructor", "constructor");
    else if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
      add(node, "method", node.name.getText(source).replace(/["']/g, ""));
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      add(node, "function", node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return declarations;
}

/** Return bounded inline-script bodies using HTML tag boundaries, not a bypassable tag regex. */
function inlineScripts(html) {
  const lower = html.toLowerCase();
  const scripts = [];
  let cursor = 0;

  function tagEnd(start) {
    let quote = "";
    for (let index = start; index < html.length; index += 1) {
      const char = html[index];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") return index;
    }
    return -1;
  }

  while (cursor < html.length) {
    const opening = lower.indexOf("<script", cursor);
    if (opening < 0) break;
    const boundary = lower[opening + 7];
    if (boundary && boundary !== ">" && !/\s/.test(boundary)) {
      cursor = opening + 7;
      continue;
    }
    const openingEnd = tagEnd(opening + 7);
    if (openingEnd < 0) break;
    let closing = lower.indexOf("</script", openingEnd + 1);
    while (closing >= 0) {
      const closingBoundary = lower[closing + 8];
      if (!closingBoundary || closingBoundary === ">" || /\s/.test(closingBoundary)) break;
      closing = lower.indexOf("</script", closing + 8);
    }
    if (closing < 0) break;
    const closingEnd = tagEnd(closing + 8);
    if (closingEnd < 0) break;
    scripts.push({ body: html.slice(openingEnd + 1, closing), start: openingEnd + 1 });
    cursor = closingEnd + 1;
  }
  return scripts;
}

const sourceFiles = walk(path.join(root, "packages"))
  .concat(walk(path.join(root, "plugins")))
  .filter((absolute) => /\.(?:ts|js)$/.test(absolute))
  .filter((absolute) => !/\.test\.(?:ts|js)$/.test(absolute))
  .filter((absolute) => !absolute.includes(`${path.sep}dist${path.sep}`));
const declarationsByFile = new Map();
for (const absolute of sourceFiles) {
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  declarationsByFile.set(relative, collectDeclarations(relative, fs.readFileSync(absolute, "utf8")));
}

for (const relative of ["plugins/form-builder/ui/index.html", "plugins/image-crop/ui/index.html"]) {
  const html = fs.readFileSync(path.join(root, relative), "utf8");
  const declarations = [];
  for (const script of inlineScripts(html)) {
    const lineOffset = html.slice(0, script.start).split("\n").length - 1;
    declarations.push(...collectDeclarations(relative, script.body, lineOffset, htmlSummaries));
  }
  declarationsByFile.set(relative, declarations);
}

const missingSummaries = [];
for (const [relative, declarations] of declarationsByFile) {
  for (const declaration of declarations) {
    if (!declaration.summary) missingSummaries.push(`${relative}:${declaration.line} ${declaration.name}`);
  }
}
if (missingSummaries.length) {
  console.error("Declarations missing documentation:\n" + missingSummaries.join("\n"));
  process.exit(1);
}

/** Escape table content for Markdown. */
function md(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/\\/g, "&#92;")
    .replace(/\|/g, "&#124;")
    .replace(/`/g, "&#96;")
    .replace(/\[/g, "&#91;")
    .replace(/\]/g, "&#93;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n|\r|\n/g, "<br>");
}

const sourceLines = [
  "# Generated Source API",
  "",
  "> Generated by `scripts/generate-reference.mjs`. Do not edit by hand.",
  "> Markdown-sensitive source text is encoded before table rendering.",
  "",
  "Every named production class, interface, type, function, constructor, and method is listed below. Anonymous event callbacks are implementation details owned by their nearest named binder.",
  "",
];
let declarationCount = 0;
for (const [relative, declarations] of [...declarationsByFile].sort(([a], [b]) => a.localeCompare(b))) {
  if (!declarations.length) continue;
  sourceLines.push(`## \`${relative}\``, "", "| Kind | Declaration | Source | Contract |", "| --- | --- | --- | --- |");
  for (const declaration of declarations.sort((a, b) => a.line - b.line)) {
    declarationCount += 1;
    sourceLines.push(`| ${declaration.kind} | \`${md(declaration.signature)}\` | [L${declaration.line}](${repositoryUrl}${relative}#L${declaration.line}) | ${md(declaration.summary)} |`);
  }
  sourceLines.push("");
}

const pluginLines = [
  "# Generated Plugin Contracts",
  "",
  "> Generated from `plugins/*/plugin.yaml`. Do not edit by hand.",
  "> Markdown-sensitive contract text is encoded before table rendering.",
  "",
];
let stepCount = 0;
for (const directory of ["form-builder", "image-crop", "slack"]) {
  const relative = `plugins/${directory}/plugin.yaml`;
  const manifest = YAML.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  pluginLines.push(
    `## ${manifest.name}`,
    "",
    `Runtime ID: \`${manifest.id}\`. Version: \`${manifest.version}\`. Minimum Flyto2 Core: \`${manifest.runtime.min_flyto_version}\`.`,
    "",
    `Runtime entry: \`${manifest.runtime.entry_point}\` (built from [\`src/index.ts\`](${repositoryUrl}plugins/${directory}/src/index.ts)). Required secrets: ${manifest.required_secrets.length ? manifest.required_secrets.map((item) => `\`${item}\``).join(", ") : "none"}.`,
    "",
  );
  for (const step of manifest.steps) {
    stepCount += 1;
    pluginLines.push(`### \`${step.id}\``, "", `${step.description}`, "");
    pluginLines.push(`Category: \`${step.category}\`. Runtime: ${step.ui ? `interactive \`${step.ui.type}\`, ${step.ui.width || "host"} x ${step.ui.height || "host"}, timeout ${step.ui.timeout_ms || 300000} ms` : "headless"}.`, "");
    pluginLines.push("**Inputs**", "", "| Name | Type | Required | Default | Constraints | Description |", "| --- | --- | --- | --- | --- | --- |");
    for (const [name, spec] of Object.entries(step.params_schema || {})) {
      const constraints = [];
      if (spec.minimum !== undefined) constraints.push(`min ${spec.minimum}`);
      if (spec.maximum !== undefined) constraints.push(`max ${spec.maximum}`);
      if (spec.options) constraints.push(spec.options.map((option) => option.value).join(", "));
      pluginLines.push(`| \`${name}\` | \`${spec.type}\` | ${spec.required ? "yes" : "no"} | ${spec.default === undefined ? "-" : `\`${md(JSON.stringify(spec.default))}\``} | ${md(constraints.join("; ") || "-")} | ${md(spec.description || spec.label || "-")} |`);
    }
    pluginLines.push("", "**Outputs**", "", "| Name | Type | Description |", "| --- | --- | --- |");
    for (const [name, spec] of Object.entries(step.output_schema || {})) {
      pluginLines.push(`| \`${name}\` | \`${spec.type}\` | ${md(spec.description || "-")} |`);
    }
    pluginLines.push("");
  }
}

const cssRelative = "packages/ui-tokens/src/tokens.css";
const css = fs.readFileSync(path.join(root, cssRelative), "utf8");
const tokens = [];
for (const [index, line] of css.split("\n").entries()) {
  const match = line.match(/^\s*(--flyto-[\w-]+):\s*([^;]+);(?:\s*\/\*\s*(.*?)\s*\*\/)?/);
  if (match) tokens.push({ name: match[1], value: match[2].trim(), note: match[3] || "", line: index + 1 });
}
const classes = [];
for (const [index, line] of css.split("\n").entries()) {
  const match = line.match(/^\.([A-Za-z][\w-]*)/);
  if (match && !classes.some((item) => item.name === match[1])) classes.push({ name: match[1], line: index + 1 });
}
const tokenLines = [
  "# Generated UI Token Reference",
  "",
  "> Generated from `packages/ui-tokens/src/tokens.css`. Do not edit by hand.",
  "> Markdown-sensitive token text is encoded before table rendering.",
  "",
  "## CSS Custom Properties",
  "",
  "| Token | Default | Note | Source |",
  "| --- | --- | --- | --- |",
  ...tokens.map((token) => `| \`${token.name}\` | \`${md(token.value)}\` | ${md(token.note || "-")} | [L${token.line}](${repositoryUrl}${cssRelative}#L${token.line}) |`),
  "",
  "## Utility Classes",
  "",
  "| Class | Source |",
  "| --- | --- |",
  ...classes.map((item) => `| \`.${item.name}\` | [L${item.line}](${repositoryUrl}${cssRelative}#L${item.line}) |`),
  "",
];

const outputs = new Map([
  ["source-api.md", sourceLines.join("\n")],
  ["plugin-contracts.md", pluginLines.join("\n")],
  ["ui-tokens.md", tokenLines.join("\n")],
]);
fs.mkdirSync(generatedDir, { recursive: true });
let stale = false;
for (const [name, content] of outputs) {
  const target = path.join(generatedDir, name);
  if (write) fs.writeFileSync(target, content);
  else if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content) {
    console.error(`stale generated reference: docs/generated/${name}`);
    stale = true;
  }
}
if (stale) {
  console.error("Run: npm run docs:generate");
  process.exit(1);
}
console.log(`${write ? "wrote" : "references current"}: ${declarationCount} declarations, ${stepCount} steps, ${tokens.length} tokens, ${classes.length} utility classes`);
