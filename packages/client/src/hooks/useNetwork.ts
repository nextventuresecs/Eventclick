import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "../lib/db";
import { api, attendanceApi, activitiesApi, uploadToPresignedUrl } from "../lib/api";

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
      const offlineAttendance = await db.attendance.filter((record) => !record.synced).toArray();
      for (const record of offlineAttendance) {
        try {
          let photoKey = record.photoKey;
          if (!photoKey && record.photoBlob && record.photoBlob.size > 0) {
            const contentType =
              record.photoBlob.type && /^image\/(jpeg|png|webp)$/.test(record.photoBlob.type)
                ? record.photoBlob.type
                : "image/jpeg";
            const presign = await attendanceApi.presignPhoto(record.roomId, {
              contentType,
              sizeBytes: record.photoBlob.size,
            });
            await uploadToPresignedUrl(presign.uploadUrl, record.photoBlob);
            photoKey = presign.key;
            if (record.id) {
              await db.attendance.update(record.id, { photoKey, photoBlob: undefined });
            }
          }

          await api.post(`/rooms/${record.roomId}/attendance`, {
            formDefinitionId: record.formDefinitionId,
            data: record.data,
            photoKey,
            latitude: record.latitude,
            longitude: record.longitude,
            idempotencyKey: record.idempotencyKey || `att_${record.id}_${record.createdAt}`
          });
          await db.attendance.delete(record.id!);
        } catch (err) {
          console.error("Failed to sync attendance record", record, err);
        }
      }

      // Sync Activities
      const offlineActivities = await db.activities.filter((record) => !record.synced).toArray();
      for (const record of offlineActivities) {
        try {
          let photoKey = record.photoKey;
          if (!photoKey && record.photoBlob && record.photoBlob.size > 0) {
            const contentType =
              record.photoBlob.type && /^image\/(jpeg|png|webp)$/.test(record.photoBlob.type)
                ? record.photoBlob.type
                : "image/jpeg";
            const presign = await activitiesApi.presignPhoto(record.roomId, {
              activityId: record.activityId,
              contentType,
              sizeBytes: record.photoBlob.size,
            });
            await uploadToPresignedUrl(presign.uploadUrl, record.photoBlob);
            photoKey = presign.key;
            if (record.id) {
              await db.activities.update(record.id, { photoKey, photoBlob: undefined });
            }
          }

          await api.post(`/rooms/${record.roomId}/activities/submission`, {
            activityId: record.activityId,
            photoKey,
            latitude: record.latitude,
            longitude: record.longitude,
            idempotencyKey: record.idempotencyKey || `act_${record.id}_${record.createdAt}`
          });
          await db.activities.delete(record.id!);
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
