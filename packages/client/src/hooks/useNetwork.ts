import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "../lib/db";
import { api } from "../lib/api";

export function useNetwork() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncLock = useRef(false);

  const syncOfflineData = useCallback(async () => {
    if (!navigator.onLine || syncLock.current) return;
    syncLock.current = true;
    setIsSyncing(true);

    try {
      // Sync Attendance
      const offlineAttendance = await db.attendance.where("synced").equals(0).toArray();
      for (const record of offlineAttendance) {
        try {
          await api.post(`/rooms/${record.roomId}/attendance`, {
            formDefinitionId: record.formDefinitionId,
            data: record.data,
            photoKey: record.photoKey,
            latitude: record.latitude,
            longitude: record.longitude,
            idempotencyKey: `att_${record.id}_${record.createdAt}`
          });
          await db.attendance.update(record.id!, { synced: true });
        } catch (err) {
          console.error("Failed to sync attendance record", record, err);
        }
      }

      // Sync Activities
      const offlineActivities = await db.activities.where("synced").equals(0).toArray();
      for (const record of offlineActivities) {
        try {
          await api.post(`/rooms/${record.roomId}/activities/submission`, {
            activityId: record.activityId,
            photoKey: record.photoKey,
            latitude: record.latitude,
            longitude: record.longitude,
            idempotencyKey: `act_${record.id}_${record.createdAt}`
          });
          await db.activities.update(record.id!, { synced: true });
        } catch (err) {
          console.error("Failed to sync activity record", record, err);
        }
      }
    } finally {
      syncLock.current = false;
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineData();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check
    if (navigator.onLine) {
      syncOfflineData();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncOfflineData]);

  return { isOnline, isSyncing, syncOfflineData };
}
