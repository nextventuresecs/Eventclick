import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "@application/shared";

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  orgId: string | null;
}

export const signAccessToken = (claims: AccessTokenClaims): string =>
  jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"],
    issuer: "Eventclick",
    audience: "Eventclick-api",
  });

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    issuer: "Eventclick",
    audience: "Eventclick-api",
  });
  if (typeof decoded === "string") throw new Error("Invalid token payload");
  return decoded as AccessTokenClaims & { iat: number; exp: number };
};
