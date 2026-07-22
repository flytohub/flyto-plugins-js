#!/usr/bin/env node

/** Pack every workspace, audit contents, and smoke-test installed SDK assets. */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "flyto2-plugin-pack-"));

/** Run one command and return UTF-8 stdout. */
function run(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

try {
  const packs = JSON.parse(run("npm", ["pack", "--json", "--workspaces", "--pack-destination", temp]));
  assert.equal(packs.length, 6, "expected six publishable workspaces");

  for (const packed of packs) {
    const files = packed.files.map((item) => item.path);
    assert.ok(files.includes("README.md"), `${packed.name}: README missing from tarball`);
    assert.ok(files.includes("LICENSE"), `${packed.name}: LICENSE missing from tarball`);
    assert.ok(packed.size < 1_000_000, `${packed.name}: tarball exceeds 1 MB`);
    assert.ok(!files.some((file) => file.includes(".test.")), `${packed.name}: test file published`);
    assert.ok(!files.some((file) => file.includes("echo-test-plugin")), `${packed.name}: fixture published`);
    if (packed.name.includes("plugin-form-builder") || packed.name.includes("plugin-image-crop")
      || packed.name.includes("plugin-slack")) {
      assert.ok(files.includes("plugin.yaml"), `${packed.name}: plugin.yaml missing`);
      assert.ok(files.includes("dist/index.js"), `${packed.name}: runtime entry missing`);
      assert.ok(!files.some((file) => file.startsWith("src/")), `${packed.name}: TypeScript source published`);
      assert.ok(!files.includes("tsconfig.json"), `${packed.name}: tsconfig published`);
    }
  }

  const wanted = new Set([
    "@flyto2/plugin-sdk",
    "@flyto2/plugin-ui-bridge",
    "@flyto2/plugin-ui-tokens",
  ]);
  const tarballs = packs
    .filter((packed) => wanted.has(packed.name))
    .map((packed) => path.join(temp, packed.filename));
  fs.writeFileSync(path.join(temp, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], temp);

  const smoke = `
    import fs from 'node:fs';
    import os from 'node:os';
    import path from 'node:path';
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const { createPlugin, UIServer } = require('@flyto2/plugin-sdk');
    const tokens = await import('@flyto2/plugin-ui-tokens/inject');
    const bridge = await import('@flyto2/plugin-ui-bridge');
    const plugin = createPlugin({ id: 'smoke/package', version: '1.0.0' });
    plugin.step('ping', async () => ({ ok: true }));
    if (typeof tokens.injectTokens !== 'function' || typeof bridge.createBridge !== 'function') process.exit(2);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto2-ui-smoke-'));
    fs.writeFileSync(path.join(root, 'index.html'), '<html><head></head><body>ok</body></html>');
    const server = new UIServer({ uiRoot: root });
    const port = await server.start();
    const [css, js] = await Promise.all([
      fetch('http://127.0.0.1:' + port + '/__flyto/tokens.css'),
      fetch('http://127.0.0.1:' + port + '/__flyto/bridge.js'),
    ]);
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
    if (!css.ok || !js.ok) process.exit(3);
    console.log('installed package smoke: ok');
  `;
  const output = run(process.execPath, ["--input-type=module", "--eval", smoke], temp).trim();
  console.log(`package contents current: ${packs.length} tarballs`);
  console.log(output);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
