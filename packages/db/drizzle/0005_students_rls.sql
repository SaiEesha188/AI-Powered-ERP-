-- RLS and grants for students, guardians and enrollments (conventions in 0001_rls.sql).
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON students
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON guardians
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON student_guardians
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON enrollments
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
-- user_id links to a global identity and is never repointed by an institute.
GRANT SELECT, INSERT, DELETE ON students, guardians TO erp_app;
--> statement-breakpoint
GRANT UPDATE (admission_no, name, dob, gender, admission_date, status, medical_notes, custom_fields, updated_at) ON students TO erp_app;
--> statement-breakpoint
GRANT UPDATE (whatsapp_opt_in, language, updated_at) ON guardians TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON student_guardians, enrollments TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON students, guardians, student_guardians, enrollments TO erp_system;
--> statement-breakpoint
-- Parents and students reach only their own family's records through /family endpoints, so
-- their system roles carry no institute-wide permissions.
DELETE FROM role_permissions rp USING roles r
  WHERE rp.role_id = r.id AND r.is_system AND r.code IN ('parent', 'student');
