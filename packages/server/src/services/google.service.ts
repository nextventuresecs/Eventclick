import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  picture: string | null;
}

let client: OAuth2Client | null = null;
const getClient = (): OAuth2Client => {
  if (!env.GOOGLE_CLIENT_ID) {
    throw ApiError.badRequest("Google OAuth is not configured on this server");
  }
  if (!client) client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  return client;
};

export const verifyGoogleIdToken = async (idToken: string): Promise<GoogleProfile> => {
  try {
    const ticket = await getClient().verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID!,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw ApiError.unauthorized("Invalid Google token");
    }
    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified ?? false,
      fullName: payload.name ?? payload.email.split("@")[0]!,
      picture: payload.picture ?? null,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized("Failed to verify Google token");
  }
};
