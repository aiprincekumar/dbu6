/**
 * The sample account dbu6-seed-sample-data makes, a development tool kept
 * outside this package. It is the one account an agent access token must
 * never be minted for: seeding it again replaces its books (`dbu6 agent env`,
 * src/cli/agent-env.ts). The seed reads it from here, so the two agree.
 */
export const DEMO_ACCOUNT = {
  name: "Demo User",
  email: "demo@example.com",
  password: "demo-password",
};
