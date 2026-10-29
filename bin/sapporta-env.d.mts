// Types for `sapporta-env.mjs`, which is plain JavaScript because
// `bin/sapporta.mjs` loads it before anything else and a project may hold dbu6
// without a build.
//
// Nothing at runtime reads this file. `pnpm typecheck` checks `src/`'s use of
// the module against these types, but never these types against the code:
// keep them in step with it by hand.

export declare const AGENT_ENV_FILE: ".env.agent";

export declare function readAgentToken(
  root: string,
  fileExists?: (path: string) => boolean,
  readFile?: (path: string) => string,
): string | undefined;

export declare function findProjectRoot(
  start: string,
  fileExists?: (path: string) => boolean,
): string;

export declare function sapportaEnvironment(options: {
  root: string;
  shellEnv: NodeJS.ProcessEnv;
  fileExists?: (path: string) => boolean;
  readFile?: (path: string) => string;
}): NodeJS.ProcessEnv;
