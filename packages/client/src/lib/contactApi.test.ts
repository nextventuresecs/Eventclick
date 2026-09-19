import { describe, it, expect, vi, afterEach } from "vitest";
import { contactApi } from "./api";
import type { SubmitContactRequestInput } from "@application/shared";

describe("contactApi (DEF-026)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits contact demo request to POST /contact and returns status accepted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "accepted" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload: SubmitContactRequestInput = {
      kind: "demo",
      fullName: "Jane Doe",
      workEmail: "jane@company.org",
      orgName: "Company Org",
      teamSize: "20-50",
      useCase: "Field verification",
    };

    const result = await contactApi.submit(payload);

    expect(result).toEqual({ status: "accepted" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/contact"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });
});
