#!/usr/bin/env node

/** Validate package, manifest, and TypeScript registration parity. */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDirs = ["packages/sdk", "packages/ui-bridge", "packages/ui-tokens"];
const pluginDirs = ["plugins/form-builder", "plugins/image-crop", "plugins/slack"];
const errors = [];

/** Read and parse one repository-relative JSON file. */
function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

/** Return a named object-literal property when it exists. */
function objectProperty(node, name) {
  return node.properties.find((property) => {
    if (!ts.isPropertyAssignment(property)) return false;
    return property.name.getText().replace(/["']/g, "") === name;
  });
}

/** Convert a literal object property into a string or number. */
function literalProperty(node, name) {
  const property = objectProperty(node, name);
  if (!property) return undefined;
  const value = property.initializer;
  if (ts.isStringLiteralLike(value)) return value.text;
  if (ts.isNumericLiteral(value)) return Number(value.text);
  return undefined;
}

/** Extract createPlugin identity and step registrations from TypeScript. */
function sourceContract(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  const source = ts.createSourceFile(absolutePath, text, ts.ScriptTarget.Latest, true);
  const contract = { identity: null, steps: [], inputKeys: new Set(), secretKeys: new Set() };

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === "createPlugin" && ts.isObjectLiteralExpression(node.arguments[0])) {
      contract.identity = {
        id: literalProperty(node.arguments[0], "id"),
        version: literalProperty(node.arguments[0], "version"),
      };
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const kind = node.expression.name.text;
      const idNode = node.arguments[0];
      if ((kind === "step" || kind === "uiStep") && ts.isStringLiteralLike(idNode)) {
        const registration = { id: idNode.text, kind };
        if (kind === "uiStep" && ts.isObjectLiteralExpression(node.arguments[1])) {
          registration.ui = {
            page: literalProperty(node.arguments[1], "page"),
            type: literalProperty(node.arguments[1], "type"),
            width: literalProperty(node.arguments[1], "width"),
            height: literalProperty(node.arguments[1], "height"),
            timeoutMs: literalProperty(node.arguments[1], "timeoutMs"),
          };
        }
        contract.steps.push(registration);
      }
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === "input") {
      contract.inputKeys.add(node.name.text);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "secrets") {
      contract.secretKeys.add(node.name.text);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "process" && node.expression.name.text === "env") {
      contract.secretKeys.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return contract;
}

const packages = [...workspaceDirs, ...pluginDirs].map((directory) => ({
  directory,
  manifest: readJson(`${directory}/package.json`),
}));
const versions = new Set(packages.map(({ manifest }) => manifest.version));
if (versions.size !== 1) errors.push(`Public workspace versions differ: ${[...versions].join(", ")}`);
const workspaceVersion = [...versions][0];
const workspaceNames = new Set(packages.map(({ manifest }) => manifest.name));

for (const { directory, manifest } of packages) {
  if (!manifest.name?.startsWith("@flyto2/")) errors.push(`${directory}: package scope is not @flyto2`);
  if (manifest.author !== "Flyto2 (https://flyto2.com)") errors.push(`${directory}: author is not Flyto2`);
  if (manifest.homepage !== "https://flyto2.com") errors.push(`${directory}: homepage is not flyto2.com`);
  if (manifest.license !== "Apache-2.0") errors.push(`${directory}: license metadata is not Apache-2.0`);
  if (manifest.publishConfig?.registry !== "https://registry.npmjs.org") {
    errors.push(`${directory}: publish registry is not npmjs.org`);
  }
  if (manifest.publishConfig?.access !== "public") errors.push(`${directory}: package is not public`);
  if (!fs.existsSync(path.join(root, directory, "README.md"))) errors.push(`${directory}: README.md missing`);
  if (!fs.existsSync(path.join(root, directory, "LICENSE"))) errors.push(`${directory}: LICENSE missing`);
  for (const [name, range] of Object.entries(manifest.dependencies || {})) {
    if (workspaceNames.has(name) && range !== `^${workspaceVersion}`) {
      errors.push(`${directory}: internal dependency ${name} must use ^${workspaceVersion}`);
    }
  }
}

const sdk = readJson("packages/sdk/package.json");
for (const dependency of ["@flyto2/plugin-ui-bridge", "@flyto2/plugin-ui-tokens"]) {
  if (!sdk.dependencies?.[dependency]) errors.push(`packages/sdk: runtime dependency ${dependency} missing`);
}

let stepCount = 0;
for (const directory of pluginDirs) {
  const packageManifest = readJson(`${directory}/package.json`);
  const manifest = YAML.parse(fs.readFileSync(path.join(root, directory, "plugin.yaml"), "utf8"));
  const source = sourceContract(`${directory}/src/index.ts`);
  const manifestIds = manifest.steps.map((step) => step.id).sort();
  const sourceIds = source.steps.map((step) => step.id).sort();
  const manifestInputKeys = [...new Set(manifest.steps.flatMap((step) => Object.keys(step.params_schema || {})))].sort();
  const sourceInputKeys = [...source.inputKeys].sort();
  const manifestSecretKeys = Array.isArray(manifest.required_secrets)
    ? [...manifest.required_secrets].sort()
    : [];
  const sourceSecretKeys = [...source.secretKeys].sort();
  stepCount += manifestIds.length;

  if (manifest.version !== packageManifest.version) errors.push(`${directory}: package/plugin versions differ`);
  if (source.identity?.id !== manifest.id) errors.push(`${directory}: source/plugin runtime IDs differ`);
  if (source.identity?.version !== manifest.version) errors.push(`${directory}: source/plugin versions differ`);
  if (JSON.stringify(manifestIds) !== JSON.stringify(sourceIds)) {
    errors.push(`${directory}: manifest/source step IDs differ (${manifestIds} vs ${sourceIds})`);
  }
  if (manifest.runtime?.entry_point !== packageManifest.main) {
    errors.push(`${directory}: plugin entry point differs from package main`);
  }
  if (!Array.isArray(manifest.required_secrets)) errors.push(`${directory}: required_secrets must be an array`);
  if (JSON.stringify(manifestInputKeys) !== JSON.stringify(sourceInputKeys)) {
    errors.push(`${directory}: manifest/source input fields differ (${manifestInputKeys} vs ${sourceInputKeys})`);
  }
  if (JSON.stringify(manifestSecretKeys) !== JSON.stringify(sourceSecretKeys)) {
    errors.push(`${directory}: manifest/source secret names differ (${manifestSecretKeys} vs ${sourceSecretKeys})`);
  }

  for (const step of manifest.steps) {
    const registration = source.steps.find((item) => item.id === step.id);
    const expectedKind = step.ui ? "uiStep" : "step";
    if (registration?.kind !== expectedKind) errors.push(`${directory}:${step.id}: UI/headless kind differs`);
    if (step.ui && registration?.ui) {
      for (const [manifestKey, sourceKey] of [
        ["page", "page"], ["type", "type"], ["width", "width"], ["height", "height"],
      ]) {
        if (step.ui[manifestKey] !== registration.ui[sourceKey]) {
          errors.push(`${directory}:${step.id}: UI ${manifestKey} differs`);
        }
      }
      if (step.ui.timeout_ms !== registration.ui.timeoutMs) {
        errors.push(`${directory}:${step.id}: UI timeout differs`);
      }
    }
  }
}

if (process.env.GITHUB_REF_TYPE === "tag") {
  const version = [...versions][0];
  if (process.env.GITHUB_REF_NAME !== `v${version}`) {
    errors.push(`Release tag ${process.env.GITHUB_REF_NAME} must match workspace version v${version}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`workspace contracts current: ${packages.length} packages, ${stepCount} plugin steps, version ${workspaceVersion}`);
