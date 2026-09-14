import { describe, it, expect, vi } from "vitest";
import {
  parseCommand,
  normalizeEmail,
  execute,
  main,
  EXIT_OK,
  EXIT_REFUSED,
  EXIT_USAGE,
  type Queryable,
} from "../maintainers";

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
};

/** A fake pg client that answers queries in order. */
const fakeDb = (...responses: Array<{ rows: Record<string, unknown>[] } | Error>) => {
  const query = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected query");
    if (next instanceof Error) throw next;
    return { rows: next.rows, rowCount: next.rows.length };
  });
  return { query, end: vi.fn(async () => {}) } as unknown as Queryable & {
    query: typeof query;
    end: () => Promise<void>;
  };
};

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Jane@Example.ORG ")).toBe("jane@example.org");
  });
});

describe("parseCommand", () => {
  it("parses add and normalizes both emails", () => {
    expect(parseCommand(["add", "--email", " Jane@Example.org", "--name", " Jane ", "--added-by", "Ops@NVCES.in"])).toEqual({
      ok: true,
      command: { kind: "add", email: "jane@example.org", name: "Jane", addedBy: "ops@nvces.in" },
    });
  });

  it.each([
    [["add", "--name", "Jane", "--added-by", "ops@nvces.in"], "--email is required"],
    [["add", "--email", "not-an-email", "--name", "Jane", "--added-by", "ops@nvces.in"], "--email is not a valid email"],
    [["add", "--email", "jane@example.org", "--added-by", "ops@nvces.in"], "--name is required"],
    [["add", "--email", "jane@example.org", "--name", "Jane"], "--added-by is required"],
    [["reactivate", "--email", "jane@example.org"], "--added-by is required"],
    [["deactivate", "--email", "jane@example.org", "--name", "Jane"], "--name is not accepted by deactivate"],
    [["list", "--email", "jane@example.org"], "--email is not accepted by list"],
    [["delete", "--email", "jane@example.org"], "unknown command: delete"],
    [[], "missing command"],
  ])("rejects %j", (argv, message) => {
    const result = parseCommand(argv);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });

  it("rejects unknown flags and positionals", () => {
    expect(parseCommand(["deactivate", "--email", "a@b.co", "--force"]).ok).toBe(false);
    expect(parseCommand(["list", "extra"]).ok).toBe(false);
  });
});

describe("execute", () => {
  it("add inserts a new maintainer", async () => {
    const db = fakeDb({ rows: [] }, { rows: [] });
    const t = io();
    const code = await execute({ kind: "add", email: "jane@example.org", name: "Jane", addedBy: "ops@nvces.in" }, db, t.io);
    expect(code).toBe(EXIT_OK);
    expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining("INSERT INTO maintainers"), [
      "jane@example.org",
      "Jane",
      "ops@nvces.in",
    ]);
  });

  it("add refuses an existing active maintainer with 'already exists'", async () => {
    const db = fakeDb({ rows: [{ is_active: true }] });
    const t = io();
    const code = await execute({ kind: "add", email: "jane@example.org", name: "Jane", addedBy: "ops@nvces.in" }, db, t.io);
    expect(code).toBe(EXIT_REFUSED);
    expect(t.err.join("\n")).toContain("already exists");
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("add points an inactive maintainer at reactivate", async () => {
    const db = fakeDb({ rows: [{ is_active: false }] });
    const t = io();
    const code = await execute({ kind: "add", email: "jane@example.org", name: "Jane", addedBy: "ops@nvces.in" }, db, t.io);
    expect(code).toBe(EXIT_REFUSED);
    expect(t.err.join("\n")).toContain("use reactivate");
  });

  it("add maps a unique violation from a concurrent add to 'already exists'", async () => {
    const db = fakeDb({ rows: [] }, Object.assign(new Error("duplicate key"), { code: "23505" }));
    const t = io();
    const code = await execute({ kind: "add", email: "jane@example.org", name: "Jane", addedBy: "ops@nvces.in" }, db, t.io);
    expect(code).toBe(EXIT_REFUSED);
    expect(t.err.join("\n")).toContain("already exists");
  });

  it.each(["deactivate", "reactivate"] as const)("%s exits 1 when the maintainer does not exist", async (kind) => {
    const db = fakeDb({ rows: [] });
    const t = io();
    const command =
      kind === "deactivate" ? { kind, email: "ghost@example.org" } : { kind, email: "ghost@example.org", addedBy: "ops@nvces.in" };
    expect(await execute(command, db, t.io)).toBe(EXIT_REFUSED);
    expect(t.err.join("\n")).toContain("not found");
  });

  it("list prints only the documented columns", async () => {
    const db = fakeDb({
      rows: [
        {
          email: "jane@example.org",
          display_name: "Jane",
          is_active: false,
          created_at: new Date("2026-09-14T00:00:00Z"),
          deactivated_at: new Date("2026-09-15T00:00:00Z"),
        },
      ],
    });
    const t = io();
    expect(await execute({ kind: "list" }, db, t.io)).toBe(EXIT_OK);
    expect(t.out).toEqual([
      "email\tdisplay_name\tis_active\tcreated_at\tdeactivated_at",
      "jane@example.org\tJane\tfalse\t2026-09-14T00:00:00.000Z\t2026-09-15T00:00:00.000Z",
    ]);
  });
});

describe("main", () => {
  it("exits 2 with usage on a bad command, without connecting", async () => {
    const connect = vi.fn();
    const t = io();
    expect(await main(["nope"], { DATABASE_URL: "postgres://x" }, t.io, connect)).toBe(EXIT_USAGE);
    expect(connect).not.toHaveBeenCalled();
    expect(t.err.join("\n")).toContain("Usage:");
  });

  it("exits 2 when DATABASE_URL is missing", async () => {
    const connect = vi.fn();
    const t = io();
    expect(await main(["list"], {}, t.io, connect)).toBe(EXIT_USAGE);
    expect(connect).not.toHaveBeenCalled();
    expect(t.err.join("\n")).toContain("DATABASE_URL is required");
  });

  it("closes the pool even when the command throws", async () => {
    const db = fakeDb(new Error("connection reset"));
    const t = io();
    await expect(main(["list"], { DATABASE_URL: "postgres://x" }, t.io, () => db)).rejects.toThrow("connection reset");
    expect(db.end).toHaveBeenCalled();
  });
});
