type Env = { EMAIL_APP_URL: string; EMAIL_DISPATCH_SECRET: string };

// Separate from the website: mail continues when nobody has a game tab open.
export async function dispatchScheduledEmail(env: Env, fetcher: typeof fetch = fetch) {
  const origin = new URL(env.EMAIL_APP_URL);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Invalid email app origin");
  }
  if (!env.EMAIL_DISPATCH_SECRET || env.EMAIL_DISPATCH_SECRET.length < 32) throw new Error("Missing dispatch secret");
  for (let batch = 0; batch < 3; batch++) {
    const response = await fetcher(`${origin.origin}/api/email/dispatch`, {
      method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${env.EMAIL_DISPATCH_SECRET}` },
      // Match the endpoint's bounded 270s drain plus response overhead.
      signal: AbortSignal.timeout(285000),
    });
    if (!response.ok) throw new Error("Email dispatcher unavailable");
    const result = await response.json() as { stopped?: string };
    if (!["batch_limit", "time_limit"].includes(result.stopped ?? "")) break;
  }
}

const worker = {
  async scheduled(_event: unknown, env: Env) { await dispatchScheduledEmail(env); },
  fetch() { return new Response("Not found", { status: 404 }); },
};

export default worker;
