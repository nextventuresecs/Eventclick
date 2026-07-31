import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FormDefinition, FormField, UserRole } from "@application/shared";
import { db } from "../db";
import {
  eventRooms,
  formDefinitions,
  type FormDefinitionRow,
} from "../db/schema";
import { ApiError } from "../utils/errors";
import { assertRoomAccessForUser, assertRoomAccessWithRoom } from "./event-assignment.service";

const toFormDefinition = (row: FormDefinitionRow): FormDefinition => ({
  id: row.id,
  roomId: row.roomId,
  version: row.version,
  fields: row.fields,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const assertRoomInOrg = async (roomId: string, orgId: string): Promise<void> => {
  const [room] = await db
    .select({ id: eventRooms.id })
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.id, roomId),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .limit(1);
  if (!room) throw ApiError.notFound("Room not found");
};

interface RoomAccessPrincipal {
  id: string;
  role: UserRole;
}

export const getLatestFormDefinition = async (
  roomId: string,
  orgId: string,
  user: RoomAccessPrincipal,
): Promise<FormDefinition | null> => {
  await assertRoomInOrg(roomId, orgId);
  await assertRoomAccessWithRoom({ ...user, organizationId: orgId }, orgId, roomId);
  const [row] = await db
    .select()
    .from(formDefinitions)
    .where(and(eq(formDefinitions.roomId, roomId), isNull(formDefinitions.deletedAt)))
    .orderBy(desc(formDefinitions.version))
    .limit(1);
  return row ? toFormDefinition(row) : null;
};

export const saveFormDefinition = async (
  roomId: string,
  orgId: string,
  user: RoomAccessPrincipal,
  fields: FormField[],
): Promise<FormDefinition> => {
  await assertRoomInOrg(roomId, orgId);
  await assertRoomAccessWithRoom({ ...user, organizationId: orgId }, orgId, roomId);

  const [latest] = await db
    .select({ version: formDefinitions.version })
    .from(formDefinitions)
    .where(and(eq(formDefinitions.roomId, roomId), isNull(formDefinitions.deletedAt)))
    .orderBy(desc(formDefinitions.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  const [row] = await db
    .insert(formDefinitions)
    .values({
      roomId,
      organizationId: orgId,
      version: nextVersion,
      fields,
      updatedAt: sql`now()`,
    })
    .returning();

  if (!row) throw ApiError.internal("Failed to save form definition");

  // Keep only the 10 most recent versions (soft-delete older ones)
  const minVersionToKeep = nextVersion - 9;
  if (minVersionToKeep > 1) {
    await db
      .update(formDefinitions)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(formDefinitions.roomId, roomId),
          sql`${formDefinitions.version} < ${minVersionToKeep}`,
          isNull(formDefinitions.deletedAt)
        )
      );
  }

  return toFormDefinition(row);
};
