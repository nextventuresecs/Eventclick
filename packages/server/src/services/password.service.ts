import * as argon2 from "argon2";

export const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  argon2.verify(hash, plain);
