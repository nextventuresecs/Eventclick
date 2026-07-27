import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";
import {
  getCurrentUser,
  loginUser,
  loginWithGoogle,
  logoutSession,
  refreshSession,
  registerUser,
  forgotPassword,
  resetPassword,
  completeOnboarding,
  verifyEmailToken,
  resendVerificationToken,
  updateUserProfile,
  changeUserPassword,
  type AuthResult,
} from "../services/auth.service";
import { refreshTtlMs } from "../services/session.service";
import { API_PREFIX } from "@application/shared";

const REFRESH_COOKIE = "Eventclick_rt";
const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: REFRESH_COOKIE_PATH,
  maxAge: refreshTtlMs,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

const extractMeta = (req: Request) => ({
  userAgent: req.headers["user-agent"] ?? null,
  ipAddress: req.ip ?? null,
});

const setRefreshCookie = (res: Response, refreshToken: string) =>
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());

const clearRefreshCookie = (res: Response) =>
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: 0 });

const sendAuthResult = (res: Response, result: AuthResult, status = 200) => {
  setRefreshCookie(res, result.refreshToken);
  res
    .status(status)
    .json({ user: result.user, accessToken: result.accessToken });
};

export const register: RequestHandler = async (req, res, next) => {
  try {
    const result = await registerUser(req.body, extractMeta(req));
    // Do not issue tokens, just return success so user checks email
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const result = await loginUser(req.body, extractMeta(req));
    sendAuthResult(res, result);
  } catch (err) {
    next(err);
  }
};

export const verifyEmail: RequestHandler = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) throw ApiError.badRequest("Verification token is required");
    const result = await verifyEmailToken(token, extractMeta(req));
    sendAuthResult(res, result);
  } catch (err) {
    next(err);
  }
};

export const resendVerification: RequestHandler = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) throw ApiError.badRequest("Email is required");
    await resendVerificationToken(email);
    res.status(200).json({ message: "If the email is unverified, a new link has been sent." });
  } catch (err) {
    next(err);
  }
};

export const google: RequestHandler = async (req, res, next) => {
  try {
    const result = await loginWithGoogle(req.body, extractMeta(req));
    sendAuthResult(res, result);
  } catch (err) {
    next(err);
  }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw ApiError.unauthorized("Missing refresh token");
    const result = await refreshSession(token, extractMeta(req));
    sendAuthResult(res, result);
  } catch (err) {
    clearRefreshCookie(res);
    next(err);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    await logoutSession(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const me: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const user = await getCurrentUser(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

export const forgot: RequestHandler = async (req, res, next) => {
  try {
    await forgotPassword(req.body.email);
    res
      .status(200)
      .json({
        message:
          "If the email exists, you will receive a password reset link shortly.",
      });
  } catch (err) {
    next(err);
  }
};

export const reset: RequestHandler = async (req, res, next) => {
  try {
    await resetPassword(req.body.token, req.body.password);
    res.status(200).json({ message: "Password has been reset successfully" });
  } catch (err) {
    next(err);
  }
};

export const onboard: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized("Authentication required");
    const result = await completeOnboarding(
      req.user.id,
      req.body,
      extractMeta(req),
    );
    sendAuthResult(res, result);
  } catch (err) {
    next(err);
  }
};

export const updateProfile: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const user = await updateUserProfile(req.user.id, req.body);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

export const changePassword: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    await changeUserPassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};
