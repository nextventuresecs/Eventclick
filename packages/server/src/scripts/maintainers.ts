/**
 * Manage Ops Console maintainers.
 *
 *   dev:  npm run ops:maintainers --workspace=server -- <command> [flags]
 *   prod: node packages/server/dist/scripts/maintainers.js <command> [flags]
 *
 *   add        --email <e> --name <n> --added-by <operator-email>
 *   reactivate --email <e> --added-by <operator-email>
 *   deactivate --email <e>
 *   list
 *
 * Connects with DATABASE_URL (the migration owner): the maintainer roles are
 * deliberately unable to write to `maintainers`. Reads DATABASE_URL directly
 * instead of importing config/env, which exits when the tenant runtime
 * variables are absent — and a one-off operator container has none of them.
 *
 * There is no delete. maintainer_access_log references maintainers with
 * ON DELETE RESTRICT, and a maintainer's history outlives their access.
 *
 * Exit codes: 0 success, 1 refused (not found, already exists, ...),
 * 2 usage error or missing DATABASE_URL.
 */
import { parseArgs } from "node:util";
import { config as loadDotenv } from "dotenv";
import { Pool } from "pg";
import { z } from "zod";

export const EXIT_OK = 0;
export const EXIT_REFUSED = 1;
export const EXIT_USAGE = 2;

const USAGE = `Usage:
  maintainers add        --email <e> --name <n> --added-by <operator-email>
  maintainers reactivate --email <e> --added-by <operator-email>
  maintainers deactivate --email <e>
  maintainers list`;

export type Command =
  | { kind: "add"; email: string; name: string; addedBy: string }
  | { kind: "reactivate"; email: string; addedBy: string }
  | { kind: "deactivate"; email: string }
  | { kind: "list" };

export type ParseResult = { ok: true; command: Command } | { ok: false; error: string };

/** Emails are stored trimmed and lowercased; the table CHECK enforces the latter. */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

const emailSchema = z.email();
const nameSchema = z.string().trim().min(1).max(120);

export function parseCommand(argv: string[]): ParseResult {
  const [kind, ...rest] = argv;
  let values: Record<string, string | undefined>;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        email: { type: "string" },
        name: { type: "string" },
        "added-by": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const email = (flag: "email" | "added-by"): string | { error: string } => {
    const raw = values[flag];
    if (raw === undefined) return { error: `--${flag} is required` };
    const normalized = normalizeEmail(raw);
    if (!emailSchema.safeParse(normalized).success) return { error: `--${flag} is not a valid email` };
    return normalized;
  };
  const allowOnly = (...flags: string[]): string | null => {
    const extra = Object.keys(values).find((k) => values[k] !== undefined && !flags.includes(k));
    return extra ? `--${extra} is not accepted by ${kind}` : null;
  };

  switch (kind) {
    case "add": {
      const e = email("email");
      if (typeof e !== "string") return { ok: false, error: e.error };
      const by = email("added-by");
      if (typeof by !== "string") return { ok: false, error: by.error };
      const name = nameSchema.safeParse(values.name ?? "");
      if (!name.success) return { ok: false, error: "--name is required (1-120 characters)" };
      return { ok: true, command: { kind, email: e, name: name.data, addedBy: by } };
    }
    case "reactivate": {
      const extra = allowOnly("email", "added-by");
      if (extra) return { ok: false, error: extra };
      const e = email("email");
      if (typeof e !== "string") return { ok: false, error: e.error };
      const by = email("added-by");
      if (typeof by !== "string") return { ok: false, error: by.error };
      return { ok: true, command: { kind, email: e, addedBy: by } };
    }
    case "deactivate": {
      const extra = allowOnly("email");
      if (extra) return { ok: false, error: extra };
      const e = email("email");
      if (typeof e !== "string") return { ok: false, error: e.error };
      return { ok: true, command: { kind, email: e } };
    }
    case "list": {
      const extra = allowOnly();
      if (extra) return { ok: false, error: extra };
      return { ok: true, command: { kind } };
    }
    default:
      return { ok: false, error: kind ? `unknown command: ${kind}` : "missing command" };
  }
}

/** The slice of pg the CLI needs, so tests can substitute a fake. */
export interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

const UNIQUE_VIOLATION = "23505";

export async function execute(command: Command, db: Queryable, io: Io): Promise<number> {
  switch (command.kind) {
    case "add": {
      const existing = await db.query<{ is_active: boolean }>(
        "SELECT is_active FROM maintainers WHERE email = $1",
        [command.email],
      );
      if (existing.rows[0]) {
        io.err(
          existing.rows[0].is_active
            ? `${command.email}: already exists`
            : `${command.email}: already exists but is inactive; use reactivate`,
        );
        return EXIT_REFUSED;
      }
      try {
        await db.query("INSERT INTO maintainers (email, display_name, added_by) VALUES ($1, $2, $3)", [
          command.email,
          command.name,
          command.addedBy,
        ]);
      } catch (err) {
        // Lost a race with a concurrent add.
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
          io.err(`${command.email}: already exists`);
          return EXIT_REFUSED;
        }
        throw err;
      }
      io.out(`added ${command.email}`);
      return EXIT_OK;
    }

    case "reactivate": {
      const res = await db.query<{ was_active: boolean }>(
        `UPDATE maintainers m
            SET is_active = true, deactivated_at = NULL,
                -- Credit the operator only when this call changes something.
                added_by = CASE WHEN prev.was_active THEN m.added_by ELSE $2 END
           FROM (SELECT id, is_active AS was_active FROM maintainers WHERE email = $1) prev
          WHERE m.id = prev.id
          RETURNING prev.was_active`,
        [command.email, command.addedBy],
      );
      if (!res.rows[0]) {
        io.err(`${command.email}: not found`);
        return EXIT_REFUSED;
      }
      io.out(res.rows[0].was_active ? `${command.email} was already active` : `reactivated ${command.email}`);
      return EXIT_OK;
    }

    case "deactivate": {
      // COALESCE keeps the original timestamp when deactivating twice.
      const res = await db.query<{ was_active: boolean }>(
        `UPDATE maintainers m
            SET is_active = false, deactivated_at = COALESCE(m.deactivated_at, now())
           FROM (SELECT id, is_active AS was_active FROM maintainers WHERE email = $1) prev
          WHERE m.id = prev.id
          RETURNING prev.was_active`,
        [command.email],
      );
      if (!res.rows[0]) {
        io.err(`${command.email}: not found`);
        return EXIT_REFUSED;
      }
      io.out(res.rows[0].was_active ? `deactivated ${command.email}` : `${command.email} was already inactive`);
      return EXIT_OK;
    }

    case "list": {
      const res = await db.query<{
        email: string;
        display_name: string;
        is_active: boolean;
        created_at: Date;
        deactivated_at: Date | null;
      }>("SELECT email, display_name, is_active, created_at, deactivated_at FROM maintainers ORDER BY created_at");
      if (res.rows.length === 0) {
        io.out("no maintainers");
        return EXIT_OK;
      }
      io.out(["email", "display_name", "is_active", "created_at", "deactivated_at"].join("\t"));
      for (const r of res.rows) {
        io.out(
          [
            r.email,
            r.display_name,
            String(r.is_active),
            r.created_at.toISOString(),
            r.deactivated_at ? r.deactivated_at.toISOString() : "",
          ].join("\t"),
        );
      }
      return EXIT_OK;
    }
  }
}

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv,
  io: Io,
  connect: (url: string) => Queryable & { end(): Promise<void> } = (url) => new Pool({ connectionString: url, max: 1 }),
): Promise<number> {
  const parsed = parseCommand(argv);
  if (!parsed.ok) {
    io.err(`error: ${parsed.error}`);
    io.err(USAGE);
    return EXIT_USAGE;
  }
  const url = env.DATABASE_URL;
  if (!url) {
    io.err("error: DATABASE_URL is required");
    return EXIT_USAGE;
  }
  const db = connect(url);
  try {
    return await execute(parsed.command, db, io);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  // Local convenience only; never overrides variables already set.
  loadDotenv({ quiet: true });
  main(process.argv.slice(2), process.env, {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("error:", (err as Error).message);
      process.exit(EXIT_REFUSED);
    });
}
