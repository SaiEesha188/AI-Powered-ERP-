-- RLS and grants for learning materials (conventions in 0001_rls.sql).
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON materials
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE material_sections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON material_sections
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON materials, material_sections TO erp_app, erp_system;
