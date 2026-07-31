-- Add organization_id to child tables missing it
-- Backfill from parent event_rooms, then add FK + NOT NULL + index

-- activity_submissions
ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS organization_id UUID;
UPDATE activity_submissions SET organization_id = event_rooms.organization_id FROM event_rooms WHERE activity_submissions.room_id = event_rooms.id AND activity_submissions.organization_id IS NULL;
ALTER TABLE activity_submissions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE activity_submissions ADD CONSTRAINT activity_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS activity_submissions_org_idx ON activity_submissions(organization_id);

-- activity_photos
ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS organization_id UUID;
UPDATE activity_photos SET organization_id = event_rooms.organization_id FROM event_rooms WHERE activity_photos.room_id = event_rooms.id AND activity_photos.organization_id IS NULL;
ALTER TABLE activity_photos ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE activity_photos ADD CONSTRAINT activity_photos_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS activity_photos_org_idx ON activity_photos(organization_id);

-- attendance_entries
ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS organization_id UUID;
UPDATE attendance_entries SET organization_id = event_rooms.organization_id FROM event_rooms WHERE attendance_entries.room_id = event_rooms.id AND attendance_entries.organization_id IS NULL;
ALTER TABLE attendance_entries ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE attendance_entries ADD CONSTRAINT attendance_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS attendance_entries_org_idx ON attendance_entries(organization_id);

-- room_recordings
ALTER TABLE room_recordings ADD COLUMN IF NOT EXISTS organization_id UUID;
UPDATE room_recordings SET organization_id = event_rooms.organization_id FROM event_rooms WHERE room_recordings.room_id = event_rooms.id AND room_recordings.organization_id IS NULL;
ALTER TABLE room_recordings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE room_recordings ADD CONSTRAINT room_recordings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS room_recordings_org_idx ON room_recordings(organization_id);

-- form_definitions
ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS organization_id UUID;
UPDATE form_definitions SET organization_id = event_rooms.organization_id FROM event_rooms WHERE form_definitions.room_id = event_rooms.id AND form_definitions.organization_id IS NULL;
ALTER TABLE form_definitions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE form_definitions ADD CONSTRAINT form_definitions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS form_definitions_org_idx ON form_definitions(organization_id);
