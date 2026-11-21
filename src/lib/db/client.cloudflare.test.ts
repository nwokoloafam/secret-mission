import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postgres: vi.fn(),
  after: vi.fn(),
  env: {} as { HYPERDRIVE?: { connectionString: string } },
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("next/server", () => ({ after: mocks.after }));

// The normal React export deliberately does not memoize outside a Server
// Component render. That is the relevant path for standalone action calls.
import { db } from "./client.cloudflare";

function client() {
  return {
    end: vi.fn().mockResolvedValue(undefined),
    begin: vi.fn(),
    json: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete mocks.env.HYPERDRIVE;
  vi.stubEnv("DATABASE_URL", "postgres://test:password@database.example:6543/postgres");
  mocks.postgres.mockImplementation(client);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Cloudflare database client", () => {
  it("prefers the Hyperdrive binding and preserves prepared statements and default pipelining", async () => {
    const connectionString = "postgres://proxy:password@hyperdrive.internal:5432/postgres";
    mocks.env.HYPERDRIVE = { connectionString };
    const sql = db();
    expect(mocks.postgres).toHaveBeenCalledExactlyOnceWith(connectionString, {
      ssl: false,
      max: 5,
      prepare: true,
      connect_timeout: 10,
    });
    expect(sql.end).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(sql.end).toHaveBeenCalledExactlyOnceWith({ timeout: 5 });
  });

  it("uses Hyperdrive without a DATABASE_URL secret", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    mocks.env.HYPERDRIVE = { connectionString: "postgres://proxy:password@hyperdrive.internal:5432/postgres" };
    expect(() => db()).not.toThrow();
  });

  it("reads the runtime secret lazily and fails before allocating a client when absent", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    expect(() => db()).toThrow("DATABASE_URL is not set");
    expect(mocks.postgres).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("limits Supabase transaction-pooler concurrency without disabling transactions", () => {
    const sql = db();
    expect(mocks.postgres).toHaveBeenCalledWith(process.env.DATABASE_URL, {
      ssl: "require",
      max: 1,
      prepare: false,
      max_pipeline: 1,
      connect_timeout: 10,
    });
    expect(sql).toBe(mocks.postgres.mock.results[0].value);
    expect(sql.begin).toBe(mocks.postgres.mock.results[0].value.begin);
    expect(sql.json).toBe(mocks.postgres.mock.results[0].value.json);
  });

  it("does not reuse a socket-owning client across standalone calls", () => {
    const first = db();
    const second = db();
    expect(first).not.toBe(second);
    expect(mocks.postgres).toHaveBeenCalledTimes(2);
    expect(mocks.after).toHaveBeenCalledTimes(2);
  });

  it("registers deferred, bounded cleanup for each client without closing another request's client", async () => {
    const first = db();
    const second = db();
    expect(first.end).not.toHaveBeenCalled();
    expect(second.end).not.toHaveBeenCalled();

    const firstCleanup = mocks.after.mock.calls[0][0] as () => Promise<void>;
    const secondCleanup = mocks.after.mock.calls[1][0] as () => Promise<void>;
    await firstCleanup();
    expect(first.end).toHaveBeenCalledExactlyOnceWith({ timeout: 5 });
    expect(second.end).not.toHaveBeenCalled();

    await secondCleanup();
    expect(second.end).toHaveBeenCalledExactlyOnceWith({ timeout: 5 });
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])("supports an unencrypted local database at %s", (host) => {
    vi.stubEnv("DATABASE_URL", `postgres://test:password@${host}:5432/postgres`);
    db();
    expect(mocks.postgres.mock.calls[0][1].ssl).toBe(false);
  });

  it("requires TLS based on the hostname rather than words in the password", () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:localhost@database.example:6543/postgres");
    db();
    expect(mocks.postgres.mock.calls[0][1].ssl).toBe("require");
  });
});
