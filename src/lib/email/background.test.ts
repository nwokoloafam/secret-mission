import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ after: vi.fn(), openDb: vi.fn(), dispatch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/db/client", () => ({ openDb: mocks.openDb }));
vi.mock("./dispatch", () => ({ dispatchEmail: mocks.dispatch }));

describe("response-deferred email drain", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("EMAIL_MODE", "dry-run");
    vi.stubEnv("EMAIL_APP_URL", "http://localhost:3003");
    mocks.dispatch.mockResolvedValue({ processed: 0, stopped: "empty" });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("opens its own client only after the response and closes it after draining", async () => {
    const sql = { end: vi.fn().mockResolvedValue(undefined) };
    mocks.openDb.mockReturnValue(sql);
    const { scheduleEmailDispatch } = await import("./background");
    scheduleEmailDispatch();
    expect(mocks.openDb).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.dispatch).toHaveBeenCalledWith(sql);
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
    expect(mocks.dispatch.mock.invocationCallOrder[0]).toBeLessThan(sql.end.mock.invocationCallOrder[0]);
  });

  it("does not start recovery on every page poll, but never suppresses an action kick", async () => {
    const { scheduleEmailDispatch } = await import("./background");
    scheduleEmailDispatch({ recovery: true });
    scheduleEmailDispatch({ recovery: true });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    scheduleEmailDispatch();
    expect(mocks.after).toHaveBeenCalledTimes(2);
  });

  it("suppresses concurrent recovery while another drain owns a connection", async () => {
    let finish!: () => void;
    mocks.dispatch.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }).then(() => ({ stopped: "empty" })));
    mocks.openDb.mockReturnValue({ end: vi.fn().mockResolvedValue(undefined) });
    const { scheduleEmailDispatch } = await import("./background");
    // Recovery registered before the mutation may execute after its callback.
    scheduleEmailDispatch({ recovery: true });
    scheduleEmailDispatch();
    const active = mocks.after.mock.calls[1][0]();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.openDb).toHaveBeenCalledTimes(1);
    finish();
    await active;
  });

  it("redacts failures and still closes the background connection", async () => {
    const sql = { end: vi.fn().mockResolvedValue(undefined) };
    mocks.openDb.mockReturnValue(sql);
    mocks.dispatch.mockRejectedValue(new Error("private-recipient@example.com secret-api-key"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { scheduleEmailDispatch } = await import("./background");
    scheduleEmailDispatch();
    await mocks.after.mock.calls[0][0]();
    expect(sql.end).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-recipient|secret-api-key/);
  });

  it.each(["off", "invalid"])("does no work when email mode is %s", async (mode) => {
    vi.stubEnv("EMAIL_MODE", mode);
    const { scheduleEmailDispatch } = await import("./background");
    scheduleEmailDispatch();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.openDb).not.toHaveBeenCalled();
  });
});
