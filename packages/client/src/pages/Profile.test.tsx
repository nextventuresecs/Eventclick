import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUser = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "admin@example.com",
  fullName: "Ada Lovelace",
  role: "admin" as const,
  organizationId: "org-1",
  organizationName: "Evently",
  organizationLogoUrl: "",
  photoUrl: "",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const toast = vi.fn();
const updateProfile = vi.fn().mockResolvedValue({ user: mockUser });
const changePassword = vi.fn().mockResolvedValue({ message: "ok" });
const updateOrganization = vi.fn().mockResolvedValue({});
const presignOrganizationLogo = vi.fn().mockResolvedValue({
  uploadUrl: "https://s3.example.com/put/logo?sig=1",
  key: "branding/organizations/org-1/abc.png",
  publicUrl: "https://cdn.example.com/branding/organizations/org-1/abc.png",
  expiresIn: 300,
});
const presignAvatar = vi.fn().mockResolvedValue({
  uploadUrl: "https://s3.example.com/put/avatar?sig=1",
  key: "branding/users/u1/abc.png",
  publicUrl: "https://cdn.example.com/branding/users/u1/abc.png",
  expiresIn: 300,
});
const uploadToPresignedUrl = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, status: "authenticated", refresh: vi.fn() }),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/api", () => ({
  authApi: {
    updateProfile: (...a: unknown[]) => updateProfile(...a),
    changePassword: (...a: unknown[]) => changePassword(...a),
  },
  settingsApi: {
    updateOrganization: (...a: unknown[]) => updateOrganization(...a),
    presignOrganizationLogo: (...a: unknown[]) => presignOrganizationLogo(...a),
    presignAvatar: (...a: unknown[]) => presignAvatar(...a),
  },
  uploadToPresignedUrl: (...a: unknown[]) => uploadToPresignedUrl(...a),
  ApiClientError: class extends Error {},
}));

import { Profile } from "./Profile";

const pngFile = () =>
  new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(), writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), writable: true });
  }
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

describe("Profile — password visibility toggle (fix 1)", () => {
  it("reveals and hides the current password on toggle click", async () => {
    const user = userEvent.setup();
    render(<Profile />);

    const input = screen.getByLabelText(/current password/i, { selector: "input" }) as HTMLInputElement;
    expect(input.type).toBe("password");

    await user.click(screen.getByRole("button", { name: /show current password/i }));
    expect(input.type).toBe("text");

    await user.click(screen.getByRole("button", { name: /hide current password/i }));
    expect(input.type).toBe("password");
  });

  it("toggles new and confirm password independently", async () => {
    const user = userEvent.setup();
    render(<Profile />);

    const newPw = screen.getByLabelText(/^new password/i, { selector: "input" }) as HTMLInputElement;
    const confirmPw = screen.getByLabelText(/confirm new password/i, { selector: "input" }) as HTMLInputElement;

    await user.click(screen.getByRole("button", { name: /show new password/i }));
    expect(newPw.type).toBe("text");
    expect(confirmPw.type).toBe("password");
  });
});

describe("Profile — organization logo upload (fix 2)", () => {
  it("uploads the file to storage and PATCHes an http url, never a data url", async () => {
    const user = userEvent.setup();
    render(<Profile />);

    await user.upload(screen.getByLabelText(/upload logo/i, { selector: "input" }), pngFile());

    await waitFor(() => expect(presignOrganizationLogo).toHaveBeenCalledTimes(1));
    expect(presignOrganizationLogo).toHaveBeenCalledWith({
      contentType: "image/png",
      sizeBytes: 4,
    });
    expect(uploadToPresignedUrl).toHaveBeenCalledWith(
      "https://s3.example.com/put/logo?sig=1",
      expect.any(File),
    );

    await user.click(screen.getByRole("button", { name: /save logo/i }));

    await waitFor(() => expect(updateOrganization).toHaveBeenCalledTimes(1));
    const body = updateOrganization.mock.calls[0]![0] as { logoUrl: string };
    expect(body.logoUrl).toBe("https://cdn.example.com/branding/organizations/org-1/abc.png");
    expect(body.logoUrl.startsWith("data:")).toBe(false);
    expect(body.logoUrl.length).toBeLessThanOrEqual(1000);
  });

  it("rejects a pasted data url instead of sending it to the API", async () => {
    const user = userEvent.setup();
    render(<Profile />);

    const urlField = screen.getByLabelText(/logo image url/i, { selector: "input" });
    await user.type(urlField, "data:image/png;base64,AAAA");
    await user.click(screen.getByRole("button", { name: /save logo/i }));

    expect(updateOrganization).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/url/i), "error");
  });
});

describe("Profile — hero avatar upload from explorer (fix 3)", () => {
  it("uploads a chosen avatar file and saves the returned public url", async () => {
    const user = userEvent.setup();
    render(<Profile />);

    await user.click(screen.getByRole("button", { name: /change profile picture/i }));
    await user.upload(screen.getByLabelText(/upload from computer/i, { selector: "input" }), pngFile());

    await waitFor(() => expect(presignAvatar).toHaveBeenCalledTimes(1));
    expect(uploadToPresignedUrl).toHaveBeenCalledWith(
      "https://s3.example.com/put/avatar?sig=1",
      expect.any(File),
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const body = updateProfile.mock.calls[0]![0] as { photoUrl: string };
    expect(body.photoUrl).toBe("https://cdn.example.com/branding/users/u1/abc.png");
  });

  it("refuses oversized files before contacting the API", async () => {
    const user = userEvent.setup();
    render(<Profile />);

    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    await user.click(screen.getByRole("button", { name: /change profile picture/i }));
    await user.upload(screen.getByLabelText(/upload from computer/i, { selector: "input" }), big);

    expect(presignAvatar).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/5\s?MB/i), "error");
  });
});
