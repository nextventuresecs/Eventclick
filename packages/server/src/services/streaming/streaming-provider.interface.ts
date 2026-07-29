import type { LiveRole, LiveTokenResponse } from "@application/shared";
import { type roomRecordings } from "../../db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type RoomRecording = InferSelectModel<typeof roomRecordings>;

export interface IssueTokenInput {
  roomId: string;
  orgId: string;
  userId: string;
  userName: string;
  role: LiveRole;
}

export interface StreamingProvider {
  /**
   * Generates a signed access token for the streaming session.
   */
  issueToken(input: IssueTokenInput): Promise<LiveTokenResponse>;

  /**
   * Generates a token without requiring org validation (e.g. for guests via share link).
   */
  issueGuestToken(roomId: string, identity: string, userName: string): Promise<LiveTokenResponse>;

  /**
   * Starts server-side recording of the room.
   */
  startRecording(roomId: string, orgId: string): Promise<RoomRecording | undefined>;

  /**
   * Stops an active recording.
   */
  stopRecording(egressId: string, orgId: string): Promise<RoomRecording | undefined>;

  /**
   * Gets the current participant count for a room.
   */
  getParticipantCount(roomId: string): Promise<number>;
}
