-- RLS and grants for attendance (conventions in 0001_rls.sql).
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON attendance_sessions
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE student_attendance ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON student_attendance
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
-- Corrections update rows in place; the audit log keeps the history (BR-02).
GRANT SELECT, INSERT, UPDATE ON attendance_sessions, student_attendance TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_sessions, student_attendance TO erp_system;
