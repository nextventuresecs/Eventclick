import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FormDefinition, FormField } from "@application/shared";
import { db } from "../db";
import {
  eventRooms,
  formDefinitions,
  type FormDefinitionRow,
} from "../db/schema";
import { ApiError } from "../utils/errors";

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

export const getLatestFormDefinition = async (
  roomId: string,
  orgId: string,
): Promise<FormDefinition | null> => {
  await assertRoomInOrg(roomId, orgId);
  const [row] = await db
    .select()
    .from(formDefinitions)
    .where(eq(formDefinitions.roomId, roomId))
    .orderBy(desc(formDefinitions.version))
    .limit(1);
  return row ? toFormDefinition(row) : null;
};

export const saveFormDefinition = async (
  roomId: string,
  orgId: string,
  fields: FormField[],
): Promise<FormDefinition> => {
  await assertRoomInOrg(roomId, orgId);

  const [latest] = await db
    .select({ version: formDefinitions.version })
    .from(formDefinitions)
    .where(eq(formDefinitions.roomId, roomId))
    .orderBy(desc(formDefinitions.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  const [row] = await db
    .insert(formDefinitions)
    .values({
      roomId,
      version: nextVersion,
      fields,
      updatedAt: sql`now()`,
    })
    .returning();

  if (!row) throw ApiError.internal("Failed to save form definition");
  return toFormDefinition(row);
};
