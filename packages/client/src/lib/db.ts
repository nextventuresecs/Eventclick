import Dexie, { type EntityTable } from "dexie";

export interface OfflineAttendance {
  id?: number;
  roomId: string;
  formDefinitionId: string;
  data: Record<string, any>;
  photoKey?: string;
  latitude?: number;
  longitude?: number;
  synced: boolean;
  createdAt: number;
}

export interface OfflineActivity {
  id?: number;
  roomId: string;
  activityId: string;
  photoKey?: string;
  latitude?: number;
  longitude?: number;
  synced: boolean;
  createdAt: number;
}

const db = new Dexie("EventclickOfflineDB") as Dexie & {
  attendance: EntityTable<OfflineAttendance, "id">;
  activities: EntityTable<OfflineActivity, "id">;
};

// Schema declaration
db.version(1).stores({
  attendance: "++id, roomId, userId, synced, createdAt",
  activities: "++id, roomId, userId, synced, createdAt",
});

export { db };
