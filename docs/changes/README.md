# docs/changes — how we write down what we change

Every change to this codebase — a fix, a refactor, or a new feature — gets one
Markdown file in this folder, **written before the code**.

## Why before the code, not after

Writing "what the code does today" forces you to actually read the existing
code and work out why someone wrote it that way. A lot of bad refactors are
just someone deleting a line whose purpose they never learned.

If you cannot write section 1 clearly, you do not understand the code well
enough to change it yet. That is useful information, and it is cheaper to find
out now than in code review.

## Naming

`docs/changes/<feature-name>.md`

Lowercase, hyphen-separated, named for **the thing being changed** — not a
ticket number, not a date. Someone searching this folder in six months is
looking for "the SSE thing", not "TICKET-412".

Good: `sse-tenant-connection-leak.md`, `auth-rate-limiting.md`
Bad: `fix-2026-09-02.md`, `PR-88.md`, `bugfix.md`

## The template

Copy this into a new file and fill it in. Keep the four headings exactly as
they are, so every doc in this folder reads the same way.

```markdown
# <Feature or fix name>

**Status:** planned | in progress | shipped
**Touches:** packages/server/src/... (list the files)
**Ships with:** <branch name or PR link>

## 1. What the code does today

Show the current code. Explain what it does in plain words, and why it was
written that way — assume it was reasonable when it was written.

## 2. What I am changing, and why

The new code. Then the reason, stated as a problem the old code causes:
"today X happens, which means Y". Not "this is cleaner".

## 3. What this affects

Everything downstream: other files, API responses, the database, the deploy,
existing behaviour someone might depend on. Say plainly what could break and
how we would know.

## 4. What to learn from this

The general lesson, separate from this codebase. The thing worth remembering
the next time a similar problem shows up.
```

## Rules for each section

**Section 1 — today.** Quote the real code, with the file path and line
numbers. Be fair to whoever wrote it: say what problem it was solving. Code
that looks wrong usually looked right when the surrounding code was different.

**Section 2 — the change.** State the reason as a *consequence*, not a
preference. "This is cleaner" is not a reason. "Today the pool is exhausted by
ten users, which means the eleventh request hangs" is a reason.

**Section 3 — impact.** This is the section that saves you at 2am. List what
else touches this code, what behaviour someone might already depend on, and —
most importantly — **how you would know if this change broke something**. If
you cannot name a signal, you do not have a way to detect the failure, and
that is worth fixing before you ship.

**Section 4 — the lesson.** Three rules:

- Name the concept properly — *connection pooling*, *backpressure*, *leader
  election*, *fail-closed* — so someone can search for it later and read more.
- Add one sentence on how to spot the same mistake somewhere else in a
  codebase.
- It must generalise. If the lesson only applies to this one file, it belongs
  in section 2, not section 4.

## Keeping the status honest

`planned` → `in progress` → `shipped`. Update the line when it changes. A
folder full of docs that all say "planned" is a folder nobody trusts.

## The plan these come from

The phased remediation plan that produced the current batch of docs lives
outside the repo. Phases 0–3 are the pre-UAT work; each numbered item there
names the change-doc it must ship with.
