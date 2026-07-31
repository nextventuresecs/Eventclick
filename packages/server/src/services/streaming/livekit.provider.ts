import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  RoomServiceClient,
} from "livekit-server-sdk";
import { and, eq, isNull } from "drizzle-orm";
import type { LiveRole, LiveTokenResponse } from "@application/shared";
import { db } from "../../db";
import { eventRooms, roomRecordings } from "../../db/schema";
import { env } from "../../config/env";
import { ApiError } from "../../utils/errors";
import type { StreamingProvider, IssueTokenInput, RoomRecording } from "./streaming-provider.interface";

const TOKEN_TTL_SECONDS = 2 * 60 * 60;
const livekitHttpUrl = env.LIVEKIT_URL.replace(/^ws(s?):\/\//, "http$1://");

export class LiveKitProvider implements StreamingProvider {
  private egressClient: EgressClient;
  private roomService: RoomServiceClient;

  constructor() {
    this.egressClient = new EgressClient(
      env.LIVEKIT_URL,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );
    this.roomService = new RoomServiceClient(
      livekitHttpUrl,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );
  }

  private roomNameFor(roomId: string): string {
    return `Eventclick-${roomId}`;
  }

  private async signLiveToken(
    roomId: string,
    identity: string,
    userName: string,
    role: LiveRole,
  ): Promise<LiveTokenResponse> {
    const roomName = this.roomNameFor(roomId);

    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity,
      name: userName,
      ttl: TOKEN_TTL_SECONDS,
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canSubscribe: true,
      canPublish: role === "publisher",
      canPublishData: role === "publisher",
    });

    const token = await at.toJwt();

    return {
      token,
      url: env.LIVEKIT_PUBLIC_URL,
      identity,
      roomName,
      role,
    };
  }

  public async issueToken(input: IssueTokenInput): Promise<LiveTokenResponse> {
    const [room] = await db
      .select({
        id: eventRooms.id,
        streamProvider: eventRooms.streamProvider,
      })
      .from(eventRooms)
      .where(
        and(
          eq(eventRooms.id, input.roomId),
          eq(eventRooms.organizationId, input.orgId),
          isNull(eventRooms.deletedAt),
        ),
      )
      .limit(1);

    if (!room) throw ApiError.notFound("Room not found");
    if (room.streamProvider !== "livekit") {
      throw ApiError.badRequest(
        "Room is using a non-LiveKit provider. Clear fallback first.",
      );
    }

    return this.signLiveToken(input.roomId, input.userId, input.userName, input.role);
  }

  public async issueGuestToken(roomId: string, identity: string, userName: string): Promise<LiveTokenResponse> {
    return this.signLiveToken(roomId, identity, userName, "viewer");
  }

  public async startRecording(roomId: string): Promise<RoomRecording | undefined> {
    const roomName = this.roomNameFor(roomId);
    const s3Key = `recordings/${roomName}/${Date.now()}.mp4`;

    // Start the Egress job in LiveKit
    const info = await this.egressClient.startRoomCompositeEgress(roomName, {
      file: new EncodedFileOutput({
        filepath: s3Key,
        fileType: EncodedFileType.MP4,
        output: {
          case: "s3",
          value: new S3Upload({
            accessKey: env.S3_ACCESS_KEY,
            secret: env.S3_SECRET_KEY,
            bucket: env.S3_BUCKET,
            endpoint: env.S3_ENDPOINT,
            region: env.S3_REGION,
            forcePathStyle: env.S3_FORCE_PATH_STYLE,
          }),
        },
      }),
    });

    // Save the metadata in our local database
    const [recording] = await db
      .insert(roomRecordings)
      .values({
        roomId,
        egressId: info.egressId,
        s3Key,
        status: "pending",
        startedAt: new Date(),
      })
      .returning();

    return recording;
  }

  public async stopRecording(egressId: string): Promise<RoomRecording | undefined> {
    await this.egressClient.stopEgress(egressId);

    const [recording] = await db
      .update(roomRecordings)
      .set({
        status: "completed",
        endedAt: new Date(),
      })
      .where(eq(roomRecordings.egressId, egressId))
      .returning();

    return recording;
  }

  public async getParticipantCount(roomId: string): Promise<number> {
    try {
      const list = await this.roomService.listParticipants(this.roomNameFor(roomId));
      return list.length;
    } catch {
      return 0;
    }
  }
}

// Export singleton instance per industry best practices
export const streamingService: StreamingProvider = new LiveKitProvider();
