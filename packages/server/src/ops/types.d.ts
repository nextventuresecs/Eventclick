export interface Maintainer {
  id: string;
  email: string;
  displayName: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by ops requireMaintainer. Never present on tenant server requests. */
      maintainer?: Maintainer;
    }
  }
}
