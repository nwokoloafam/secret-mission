import { describe, expect, it, vi } from "vitest";
import { dispatchScheduledEmail } from "./email-scheduler";

const env = { EMAIL_APP_URL: "https://game.afamnwokolo.com", EMAIL_DISPATCH_SECRET: "x".repeat(40) };
describe("independent email scheduler", () => {
  it("uses authorization headers and stops when the queue is empty", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ stopped: "empty" }));
    await dispatchScheduledEmail(env, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`${env.EMAIL_APP_URL}/api/email/dispatch`);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${env.EMAIL_DISPATCH_SECRET}`);
  });
  it("bounds full batches and refuses redirects or failed endpoints", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ stopped: "batch_limit" })));
    await dispatchScheduledEmail(env, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
    await expect(dispatchScheduledEmail(env, vi.fn().mockResolvedValue(new Response(null, { status: 401 })))).rejects.toThrow("unavailable");
  });
});
