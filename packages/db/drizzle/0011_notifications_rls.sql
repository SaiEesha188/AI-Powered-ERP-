-- RLS and grants for the notification engine (conventions in 0001_rls.sql).
-- Request handlers only append events; the worker (erp_system) processes them and sends.
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_events
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON automation_rules
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON messages
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE message_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON message_deliveries
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
GRANT INSERT ON notification_events TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON automation_rules TO erp_app;
--> statement-breakpoint
-- The worker resolves recipients as erp_app inside the event's institute, so it can insert.
GRANT SELECT, INSERT ON messages, message_deliveries TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_events, automation_rules, messages, message_deliveries TO erp_system;
