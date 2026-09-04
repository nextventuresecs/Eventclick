-- Litigation hold flag, read by both retention purges
-- (jobs/dataRetention.ts and jobs/auditRetention.ts) before deleting anything.
--
-- WHY A COLUMN RATHER THAN A SEPARATE TABLE
-- A hold is a property of an organisation, is set at most once per
-- organisation at a time, and every purge pass has to consult it. A boolean on
-- the row a purge already joins against costs nothing; a holds table would add
-- a join to a query whose whole purpose is to be cheap and boring.
--
-- Defaults false, so applying this migration changes no behaviour on its own.
-- Both purges ship in dry-run mode regardless.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "legal_hold" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Partial index: the purge asks "which organisations are on hold", and the
-- answer is normally none. Indexing only the true rows keeps this a few pages
-- rather than one entry per organisation.
CREATE INDEX IF NOT EXISTS "organizations_legal_hold_idx"
  ON "organizations" ("id") WHERE "legal_hold";
