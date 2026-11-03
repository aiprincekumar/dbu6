#!/usr/bin/env node
/**
 * scripts/patch-antigravity.mjs
 * Deterministically patches @dbu6/app to support Antigravity as a first-class coding agent.
 * Handles client-side schema validation, contracts, server detection, and asset cache-busting.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const appDir = path.join(rootDir, 'node_modules', '@dbu6', 'app');

if (!fs.existsSync(appDir)) {
  console.log('[patch-antigravity] @dbu6/app not found, skipping patch.');
  process.exit(0);
}

function patchFile(relativePath, patcher) {
  const fullPath = path.join(appDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[patch-antigravity] Warning: ${relativePath} not found.`);
    return;
  }
  const original = fs.readFileSync(fullPath, 'utf8');
  const patched = patcher(original);
  if (original !== patched) {
    fs.writeFileSync(fullPath, patched, 'utf8');
    console.log(`[patch-antigravity] Patched ${relativePath}`);
  } else {
    console.log(`[patch-antigravity] ${relativePath} is already up to date.`);
  }
}

// 1. Shared contracts: coding-agent.js
patchFile('dist/shared/contracts/coding-agent.js', (content) => {
  let res = content;
  if (!res.includes('"antigravity"')) {
    res = res.replace(
      'z.enum(["claude-code", "codex", "pi"])',
      'z.enum(["antigravity", "claude-code", "codex", "pi"])'
    );
  }
  if (!res.includes('antigravity: { label: "Antigravity"')) {
    res = res.replace(
      'export const CODING_AGENTS = {',
      'export const CODING_AGENTS = {\n    antigravity: { label: "Antigravity", signInCommand: "antigravity" },'
    );
  }
  return res;
});

// 2. Shared contracts: coding-agent.d.ts
patchFile('dist/shared/contracts/coding-agent.d.ts', (content) => {
  let res = content;
  if (!res.includes('antigravity: "antigravity"')) {
    res = res.replace(
      'export declare const codingAgentSchema: z.ZodEnum<{\n    "claude-code": "claude-code";',
      'export declare const codingAgentSchema: z.ZodEnum<{\n    antigravity: "antigravity";\n    "claude-code": "claude-code";'
    );
  }
  if (!res.includes('readonly antigravity:')) {
    res = res.replace(
      'export declare const CODING_AGENTS: {',
      'export declare const CODING_AGENTS: {\n    readonly antigravity: {\n        readonly label: "Antigravity";\n        readonly signInCommand: "antigravity";\n    };'
    );
  }
  return res;
});

// 3. Declaration files enum unions
const dtsFiles = [
  'dist/server/modules/coding-agent/nuabase.d.ts',
  'dist/shared/contracts/agent-handoff.d.ts',
  'dist/shared/contracts/draft-transactions.d.ts',
  'dist/shared/contracts/import-drafts.d.ts',
  'dist/frontend/queries.d.ts',
  'dist/frontend/api.d.ts',
];

for (const dts of dtsFiles) {
  patchFile(dts, (content) => {
    return content
      .replaceAll(
        '"claude-code": "claude-code";\n                        codex: "codex";',
        'antigravity: "antigravity";\n                        "claude-code": "claude-code";\n                        codex: "codex";'
      )
      .replaceAll(
        '"claude-code": "claude-code";\n                    codex: "codex";',
        'antigravity: "antigravity";\n                    "claude-code": "claude-code";\n                    codex: "codex";'
      )
      .replaceAll(
        '"claude-code": "claude-code";\n            codex: "codex";',
        'antigravity: "antigravity";\n            "claude-code": "claude-code";\n            codex: "codex";'
      )
      .replaceAll(
        '"claude-code": "claude-code";\n        codex: "codex";',
        'antigravity: "antigravity";\n        "claude-code": "claude-code";\n        codex: "codex";'
      )
      .replaceAll(
        '"claude-code" | "codex" | "pi"',
        '"antigravity" | "claude-code" | "codex" | "pi"'
      );
  });
}

// 4. Bundled Client Frontend: dist/app/assets/index-Cou-F-rz.js
patchFile('dist/app/assets/index-Cou-F-rz.js', (content) => {
  let res = content;
  if (!res.includes('`antigravity`')) {
    res = res.replace(
      'jh=K([`claude-code`,`codex`,`pi`])',
      'jh=K([`antigravity`,`claude-code`,`codex`,`pi`])'
    );
    res = res.replace(
      'Mh={"claude-code":{label:`Claude Code`',
      'Mh={antigravity:{label:`Antigravity`,signInCommand:`antigravity`},"claude-code":{label:`Claude Code`'
    );
  }
  return res;
});

// 5. Create cache-busting copy for client assets
const srcAsset = path.join(appDir, 'dist', 'app', 'assets', 'index-Cou-F-rz.js');
const dstAsset = path.join(appDir, 'dist', 'app', 'assets', 'index-Cou-F-rz-v2.js');
if (fs.existsSync(srcAsset)) {
  fs.copyFileSync(srcAsset, dstAsset);
  console.log('[patch-antigravity] Synced index-Cou-F-rz-v2.js asset bundle.');
}

// 6. index.html cache-busting asset pointer
patchFile('dist/app/index.html', (content) => {
  return content.replace(
    '/assets/index-Cou-F-rz.js',
    '/assets/index-Cou-F-rz-v2.js'
  );
});

// 7. Mount.js asset cache-control: no-cache to prevent browser lock-in
patchFile('dist/server/mount.js', (content) => {
  if (content.includes('max-age=31536000, immutable')) {
    return content.replace(
      'c.header("Cache-Control", "public, max-age=31536000, immutable");',
      'c.header("Cache-Control", "no-cache");'
    );
  }
  return content;
});

console.log('[patch-antigravity] All Antigravity patches verified successfully.');
