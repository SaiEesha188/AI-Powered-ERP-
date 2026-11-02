-- RLS and grants for circulars (conventions in 0001_rls.sql).
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON announcements
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE announcement_audiences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON announcement_audiences
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE announcement_attachments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON announcement_attachments
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE announcement_recipients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON announcement_recipients
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON announcements, announcement_audiences, announcement_attachments TO erp_app;
--> statement-breakpoint
-- Receipts are added at publish; afterwards only their timestamps change.
GRANT SELECT, INSERT ON announcement_recipients TO erp_app;
--> statement-breakpoint
GRANT UPDATE (read_at, acknowledged_at) ON announcement_recipients TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON announcements, announcement_audiences, announcement_attachments, announcement_recipients TO erp_system;
