/**
 * The app's own settings, which .env.development, mise or the shell give the
 * server: its secrets, ports, database, mail and tokens. They are this
 * project's, so no process the server starts for something else gets them: a
 * parser reads a file and needs none of them, and a terminal opened for a
 * coding agent would hand them to every later window, whatever project it
 * works in.
 */
const APP_SETTING = /^(SAPPORTA_|BETTER_AUTH_|SMTP_|NUABASE_|DBU6_)/;

/** Pure: whether `name` is one of the app's settings. */
export function isAppSetting(name: string): boolean {
  return APP_SETTING.test(name);
}

/** The server's environment without the app's settings. */
export function withoutAppSettings(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !isAppSetting(name)),
  );
}

/**
 * The settings that point at a project: its folder, data, server and token.
 * A process holding another project's acts on that project's books.
 */
const PROJECT_SETTINGS = [
  "DBU6_ROOT",
  "SAPPORTA_DATA_DIR",
  "SAPPORTA_API_PORT",
  "SAPPORTA_API_URL",
  "SAPPORTA_API_TOKEN",
];

/**
 * The names of the app's settings a process may hold: those in the server's
 * environment, and those that point at a project, which another project's
 * server or an older dbu6 may have set where this one sets none.
 */
export function appSettingNames(): string[] {
  return [
    ...new Set([
      ...Object.keys(process.env).filter(isAppSetting),
      ...PROJECT_SETTINGS,
    ]),
  ];
}
