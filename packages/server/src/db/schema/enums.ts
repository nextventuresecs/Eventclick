import { pgEnum } from "drizzle-orm/pg-core";
import { USER_ROLES, ROOM_STATUSES } from "@application/shared";

export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const roomStatusEnum = pgEnum("room_status", ROOM_STATUSES);
