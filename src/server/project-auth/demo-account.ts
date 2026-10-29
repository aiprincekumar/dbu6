/**
 * The sample account dbu6-seed-sample-data makes, a development tool kept
 * outside this package. The seed reads it from here, so the two agree.
 */
export const DEMO_ACCOUNT = {
  name: "Demo User",
  email: "demo@example.com",
  password: "demo-password",
};

/**
 * Whether `user` is that sample account. It is the one account an agent
 * access token must never be minted for: seeding it again replaces its books
 * (`mintAgentToken`, modules/coding-agent/agent-access.ts).
 */
export function isSampleAccount(user: { email: string }): boolean {
  return user.email === DEMO_ACCOUNT.email;
}
