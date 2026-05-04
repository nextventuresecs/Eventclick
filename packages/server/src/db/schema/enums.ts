import { pgEnum } from "drizzle-orm/pg-core";
import {
  USER_ROLES,
  ROOM_STATUSES,
  STREAM_PROVIDERS,
  RECORDING_STATUSES,
} from "@application/shared";

export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const roomStatusEnum = pgEnum("room_status", ROOM_STATUSES);
export const streamProviderEnum = pgEnum("stream_provider", STREAM_PROVIDERS);
export const recordingStatusEnum = pgEnum("recording_status", RECORDING_STATUSES);
