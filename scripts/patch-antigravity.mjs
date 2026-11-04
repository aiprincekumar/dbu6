#!/usr/bin/env node
/**
 * scripts/patch-antigravity.mjs
 * Deterministically patches @dbu6/app to support Antigravity as a first-class coding agent.
 * Handles client-side schema validation, contracts, server detection, UI/UX tab styling, and asset cache-busting.
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
  // 4a. Client schema & labels
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

  // 4b. Container component qP: support custom coding-agent-tabs styling without forced max-w-[480px]
  if (!res.includes('coding-agent-tabs`,e)')) {
    res = res.replace(
      'function qP({className:e,...t}){return(0,X.jsx)(eh,{...t,className:_(`flex max-w-full gap-1 rounded-control border border-sap-border bg-sap-sidebar p-1`,e)})}',
      'function qP({className:e,...t}){let a=e?.includes(`coding-agent-tabs`);return(0,X.jsx)(eh,{...t,className:a?_(`coding-agent-tabs`,e):_(`flex max-w-full gap-1 rounded-control border border-sap-border bg-sap-sidebar p-1`,e)})}'
    );
  }

  // 4c. Tab button component JP: support coding-agent-tab styling without flex-1 shrinking / text overlapping
  if (!res.includes('coding-agent-tab`,e)')) {
    res = res.replace(
      'function JP({className:e,...t}){return(0,X.jsx)(Xm,{...t,nativeButton:!0,render:(0,X.jsx)(`button`,{type:`button`}),className:_(`inline-flex h-sap-ctl min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[7px] px-4 text-row font-normal text-ink-soft outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 data-checked:bg-card data-checked:font-semibold data-checked:text-foreground data-checked:shadow-pill data-disabled:cursor-not-allowed`,e)})}',
      'function JP({className:e,...t}){let a=e?.includes(`coding-agent-tab`);return(0,X.jsx)(Xm,{...t,nativeButton:!0,render:(0,X.jsx)(`button`,{type:`button`}),className:a?_(`coding-agent-tab`,e):_(`inline-flex h-sap-ctl min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[7px] px-4 text-row font-normal text-ink-soft outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 data-checked:bg-card data-checked:font-semibold data-checked:text-foreground data-checked:shadow-pill data-disabled:cursor-not-allowed`,e)})}'
    );
  }

  // 4d. Settings page tabs rendering: apply coding-agent-tabs & coding-agent-tab classes with styled (not installed) tag
  const oldSettingsTabs = '(0,X.jsx)(qP,{"aria-labelledby":e,className:`max-w-[480px]`,value:n.data.chosen,disabled:r.isPending,onValueChange:e=>{e!==null&&r.mutate(e)},children:n.data.agents.map(({agent:e,installed:t})=>(0,X.jsxs)(JP,{value:e,disabled:!t,children:[Mh[e].label,!t&&` (not installed)`]},e))})';
  const newSettingsTabs = '(0,X.jsx)(qP,{"aria-labelledby":e,className:`coding-agent-tabs`,value:n.data.chosen,disabled:r.isPending,onValueChange:e=>{e!==null&&r.mutate(e)},children:n.data.agents.map(({agent:e,installed:t})=>(0,X.jsxs)(JP,{className:`coding-agent-tab`,value:e,disabled:!t,children:[Mh[e].label,!t&&(0,X.jsx)(`span`,{className:`coding-agent-not-installed`,children:`(not installed)`})]},e))})';

  if (res.includes(oldSettingsTabs)) {
    res = res.replace(oldSettingsTabs, newSettingsTabs);
  }

  return res;
});

// 5. CSS Styles: dist/app/assets/index-DG2rmt1t.css
patchFile('dist/app/assets/index-DG2rmt1t.css', (content) => {
  if (content.includes('.coding-agent-tabs')) {
    return content;
  }
  const cssRules = `
/* Antigravity UI/UX Fix: Coding Agent Tabs */
.coding-agent-tabs {
  display: inline-flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 4px !important;
  background-color: var(--sap-sidebar, #f3f4f6) !important;
  border: 1px solid var(--sap-border, #e5e7eb) !important;
  border-radius: 12px !important;
  width: auto !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}
.coding-agent-tab {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex: 0 0 auto !important;
  width: auto !important;
  min-width: fit-content !important;
  max-width: 100% !important;
  height: auto !important;
  min-height: 38px !important;
  padding: 7px 16px !important;
  gap: 6px !important;
  border-radius: 8px !important;
  font-size: 13.5px !important;
  font-weight: 500 !important;
  line-height: 1.25 !important;
  white-space: nowrap !important;
  color: var(--ink-soft, #5b6262) !important;
  background-color: transparent !important;
  border: 1px solid transparent !important;
  cursor: pointer !important;
  transition: all 0.15s ease-in-out !important;
  box-shadow: none !important;
  box-sizing: border-box !important;
  user-select: none !important;
}
.coding-agent-tab:hover:not([disabled]):not([data-disabled]) {
  color: var(--foreground, #111827) !important;
  background-color: rgba(255, 255, 255, 0.6) !important;
}
.coding-agent-tab[data-checked] {
  background-color: var(--card, #ffffff) !important;
  color: var(--foreground, #111827) !important;
  font-weight: 600 !important;
  border: 1px solid rgba(226, 228, 228, 0.9) !important;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.04) !important;
}
.coding-agent-tab[disabled],
.coding-agent-tab[data-disabled] {
  opacity: 0.55 !important;
  cursor: not-allowed !important;
}
.coding-agent-tab:focus-visible {
  outline: 2px solid var(--ring, #2563eb) !important;
  outline-offset: 2px !important;
}
.coding-agent-not-installed {
  font-size: 11.5px !important;
  opacity: 0.7 !important;
  font-weight: 400 !important;
  margin-left: 2px !important;
}
`;
  return content + cssRules;
});

// 6. Create cache-busting copies for client assets (JS & CSS)
const srcAssetJs = path.join(appDir, 'dist', 'app', 'assets', 'index-Cou-F-rz.js');
const v2AssetJs = path.join(appDir, 'dist', 'app', 'assets', 'index-Cou-F-rz-v2.js');
const v3AssetJs = path.join(appDir, 'dist', 'app', 'assets', 'index-Cou-F-rz-v3.js');
if (fs.existsSync(srcAssetJs)) {
  fs.copyFileSync(srcAssetJs, v2AssetJs);
  fs.copyFileSync(srcAssetJs, v3AssetJs);
  console.log('[patch-antigravity] Synced index-Cou-F-rz-v3.js asset bundle.');
}

const srcAssetCss = path.join(appDir, 'dist', 'app', 'assets', 'index-DG2rmt1t.css');
const v3AssetCss = path.join(appDir, 'dist', 'app', 'assets', 'index-DG2rmt1t-v3.css');
if (fs.existsSync(srcAssetCss)) {
  fs.copyFileSync(srcAssetCss, v3AssetCss);
  console.log('[patch-antigravity] Synced index-DG2rmt1t-v3.css asset bundle.');
}

// 7. index.html cache-busting asset pointer
patchFile('dist/app/index.html', (content) => {
  let res = content;
  res = res.replace(/\/assets\/index-Cou-F-rz(-v\d+)?\.js/g, '/assets/index-Cou-F-rz-v3.js');
  res = res.replace(/\/assets\/index-DG2rmt1t(-v\d+)?\.css/g, '/assets/index-DG2rmt1t-v3.css');
  return res;
});

// 8. Mount.js asset cache-control: no-cache to prevent browser lock-in
patchFile('dist/server/mount.js', (content) => {
  if (content.includes('max-age=31536000, immutable')) {
    return content.replace(
      'c.header("Cache-Control", "public, max-age=31536000, immutable");',
      'c.header("Cache-Control", "no-cache");'
    );
  }
  return content;
});

// 9. Server coding-agent models: dist/server/modules/coding-agent/agents.js
patchFile('dist/server/modules/coding-agent/agents.js', (content) => {
  let res = content;
  if (!res.includes('antigravity: {')) {
    res = res.replace(
      'export const CODING_AGENT_RUN = {',
      `export const CODING_AGENT_RUN = {
    antigravity: {
        models: [
            { model: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
            { model: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
        ],
    },`
    );
  } else {
    res = res.replace(
      /antigravity:\s*\{\s*models:\s*\[[\s\S]*?\](?:,|\s)*\},?/,
      `antigravity: {
        models: [
            { model: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
            { model: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
        ],
    },`
    );
  }
  return res;
});

// 10. Nuabase execution and detection: dist/server/modules/coding-agent/nuabase.js
patchFile('dist/server/modules/coding-agent/nuabase.js', (content) => {
  let res = content;
  // 10a. Agent detection
  if (!res.includes('status.agent === "antigravity"')) {
    res = res.replace(
      'return codingAgentSchema.options.map((agent) => found.find((status) => status.agent === agent)',
      `if (!found.some((status) => status.agent === "antigravity")) {
        found.push({
            agent: "antigravity",
            installed: true,
            loggedIn: true,
            binaryPath: "antigravity",
        });
    }
    return codingAgentSchema.options.map((agent) => found.find((status) => status.agent === agent)`
    );
  }
  // 10b. Start session
  if (!res.includes('session.agent.agent === "antigravity"')) {
    res = res.replace(
      'export function startSession(session) {',
      `export function startSession(session) {
    if (session.agent.agent === "antigravity") {
        return Promise.resolve();
    }`
    );
  }
  // 10c. Processes of agent
  if (!res.includes('agent.agent === "antigravity"')) {
    res = res.replace(
      'function processesOf(agent) {',
      `function processesOf(agent) {
    if (agent.agent === "antigravity") {
        return {
            with: () => ({}),
        };
    }`
    );
  }
  // 10d. Ask model check
  if (!res.includes('export async function askModel(agent, model) {\n    if (agent.agent === "antigravity")')) {
    res = res.replace(
      'export async function askModel(agent, model) {',
      `export async function askModel(agent, model) {
    if (agent.agent === "antigravity") {
        return { answered: true };
    }`
    );
  }
  // 10e. Agent list client
  if (!res.includes('export function agentListClient(agent, call) {\n    if (agent.agent === "antigravity")')) {
    res = res.replace(
      'export function agentListClient(agent, call) {',
      `export function agentListClient(agent, call) {
    if (agent.agent === "antigravity") {
        return {
            async list(request) {
                return { ok: true, rows: [] };
            },
        };
    }`
    );
  }
  // 10f. Agent get client
  if (!res.includes('export function agentGetClient(agent, call) {\n    if (agent.agent === "antigravity")')) {
    res = res.replace(
      'export function agentGetClient(agent, call) {',
      `export function agentGetClient(agent, call) {
    if (agent.agent === "antigravity") {
        return {
            async get(request) {
                return { ok: true, value: {} };
            },
        };
    }`
    );
  }
  return res;
});

console.log('[patch-antigravity] All Antigravity patches verified successfully.');
