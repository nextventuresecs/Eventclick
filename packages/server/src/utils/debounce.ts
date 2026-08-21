import { logger } from "./logger";

const timers = new Map<string, NodeJS.Timeout>();

/**
 * Keyed trailing-edge debounce. Each call for a given `key` cancels any
 * still-pending call for that key and reschedules — so N rapid calls within
 * `windowMs` of each other collapse into exactly one run of the *last*
 * task passed, after the window goes quiet. Used to coalesce bursty state
 * changes (e.g. a room rapidly toggling live/pause) into a single
 * notification instead of one per toggle.
 */
export const debounceByKey = (key: string, task: () => void | Promise<void>, windowMs: number): void => {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    timers.delete(key);
    Promise.resolve(task()).catch((err) => {
      logger.error({ err, key }, "debounceByKey task failed");
    });
  }, windowMs);

  timers.set(key, timer);
};
