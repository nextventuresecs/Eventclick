import RedisStore from "rate-limit-redis";
import { redisClient } from "../config/redis";
import { ApiError } from "../utils/errors";

/**
 * Redis-backed, **fail-closed** rate limit store.
 *
 * Two properties matter, and both are the opposite of the library default.
 *
 * *Shared*: the budget lives in Redis, so it holds across replicas and
 * survives a deploy. An in-process store gives every container its own
 * allowance and resets to zero on every restart — which turns a limit into a
 * suggestion the moment there is more than one process or more than one
 * deploy a day.
 *
 * *Fail-closed*: when Redis is unavailable this throws rather than letting
 * the request through. For a limiter protecting credentials or a log sink,
 * "Redis is down so everything is allowed" is precisely the wrong failure —
 * an attacker who can degrade Redis would otherwise get an unlimited budget
 * as a bonus.
 *
 * The one exception is the `SCRIPT LOAD` the library issues at startup: a
 * dummy SHA is returned so construction does not fail before Redis has
 * connected. The real commands still fail closed.
 */
export const createFailClosedStore = (prefix: string) =>
  new RedisStore({
    prefix,
    sendCommand: async (...args: string[]) => {
      if (!redisClient.isOpen) {
        if (args[0] === "SCRIPT" && args[1] === "LOAD") return "dummy_sha_fallback";
        throw ApiError.internal("Rate limiter unavailable");
      }
      try {
        return await redisClient.sendCommand(args);
      } catch (err) {
        if (String(err).includes("NOSCRIPT")) throw err;
        throw ApiError.internal("Rate limiter unavailable");
      }
    },
  });
