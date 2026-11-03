-- RLS and grants for exams, marks and report cards (conventions in 0001_rls.sql).
ALTER TABLE assessment_types ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON assessment_types
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE grade_scales ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON grade_scales
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE grade_bands ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON grade_bands
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON exams
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE exam_papers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON exam_papers
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON marks
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE exam_section_locks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON exam_section_locks
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON report_cards
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_types, grade_scales, grade_bands, exams, exam_papers, marks, exam_section_locks, report_cards TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_types, grade_scales, grade_bands, exams, exam_papers, marks, exam_section_locks, report_cards TO erp_system;
