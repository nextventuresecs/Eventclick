import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiClientError } from "./api";

const respondWith = (status: number, body: string, contentType = "text/plain") => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(body, { status, headers: { "Content-Type": contentType } }),
    ),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rate-limited responses reach the user readably (#79)", () => {
  it("turns a plain-text 429 into a rate-limit message instead of a parse error", async () => {
    // express-rate-limit answers with plain text unless a `message` object is
    // configured — the global limiter in index.ts does not configure one. The
    // old code called JSON.parse unconditionally, so this surfaced as a
    // SyntaxError and the login page showed "Login failed".
    respondWith(429, "Too many requests, please try again later.");

    await expect(api.get("/rooms")).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      message: expect.stringContaining("Too many attempts"),
    });
  });

  it("passes through the JSON message the auth limiters do send", async () => {
    respondWith(
      429,
      JSON.stringify({ error: "RATE_LIMITED", message: "Too many auth attempts — try again later" }),
      "application/json",
    );

    await expect(api.post("/auth/login", { email: "a@b.com", password: "x" })).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many auth attempts — try again later",
    });
  });

  it("still reports non-JSON errors of other kinds rather than throwing SyntaxError", async () => {
    respondWith(502, "<html>Bad Gateway</html>");

    const err = await api.get("/rooms").catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(502);
    expect(err.message).toContain("Bad Gateway");
  });
});
