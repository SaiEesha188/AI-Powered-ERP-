-- RLS and grants for holidays and events (conventions in 0001_rls.sql).
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON calendar_events
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE calendar_event_classes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON calendar_event_classes
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_events, calendar_event_classes TO erp_app, erp_system;
