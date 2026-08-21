import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { VerifyEmailPage } from "./VerifyEmail";
import { ApiClientError } from "@/lib/api";

const mockVerifyEmail = vi.fn();
const mockSetPassword = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, verifyEmail: mockVerifyEmail, setPassword: mockSetPassword }),
}));

const renderPage = (search = "?token=abc123") =>
  render(
    <MemoryRouter initialEntries={[`/verify-email${search}`]}>
      <VerifyEmailPage />
    </MemoryRouter>,
  );

describe("VerifyEmailPage (#70 — USER_INVITED magic link)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an error when the token is missing from the URL", async () => {
    renderPage("");
    expect(await screen.findByText(/verification token is missing/i)).toBeInTheDocument();
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it("shows the plain success state when no password setup is required", async () => {
    mockVerifyEmail.mockResolvedValue({ passwordSetupRequired: false });

    renderPage();

    expect(await screen.findByText(/email verified/i)).toBeInTheDocument();
    expect(screen.queryByText(/set up your password/i)).not.toBeInTheDocument();
  });

  // Headline case for #70: an admin-invited user with no password must be
  // prompted to set one immediately after the magic link authenticates them.
  it("shows the password-setup form when the invited user has no password yet", async () => {
    mockVerifyEmail.mockResolvedValue({ passwordSetupRequired: true });

    renderPage();

    expect(await screen.findByText(/set up your password/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /go to dashboard|sign in/i })).not.toBeInTheDocument();
  });

  it("submitting the password-setup form calls setPassword and then shows the success state", async () => {
    mockVerifyEmail.mockResolvedValue({ passwordSetupRequired: true });
    mockSetPassword.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();

    await screen.findByText(/set up your password/i);
    await user.type(screen.getByLabelText(/^password$/i), "Sup3r$ecret!");
    await user.type(screen.getByLabelText(/confirm password/i), "Sup3r$ecret!");
    await user.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => expect(mockSetPassword).toHaveBeenCalledWith("Sup3r$ecret!"));
    expect(await screen.findByText(/email verified/i)).toBeInTheDocument();
  });

  it("shows a mismatch error and does not call setPassword when passwords differ", async () => {
    mockVerifyEmail.mockResolvedValue({ passwordSetupRequired: true });
    const user = userEvent.setup();

    renderPage();

    await screen.findByText(/set up your password/i);
    await user.type(screen.getByLabelText(/^password$/i), "Sup3r$ecret!");
    await user.type(screen.getByLabelText(/confirm password/i), "Different1!");
    await user.click(screen.getByRole("button", { name: /set password/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it("shows an error state when verifyEmail rejects", async () => {
    mockVerifyEmail.mockRejectedValue(new ApiClientError(400, "VALIDATION_ERROR", "Invalid or expired verification token"));

    renderPage();

    expect(await screen.findByText(/verification failed/i)).toBeInTheDocument();
    expect(await screen.findByText(/invalid or expired verification token/i)).toBeInTheDocument();
  });
});
