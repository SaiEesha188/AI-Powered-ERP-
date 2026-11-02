-- Row-level security and grants.
--
-- erp_app    : used for every tenant-scoped API request. RLS applies; the API sets
--              app.institute_id / app.user_id at the start of each transaction (withTenant()).
--              With nothing set, every policy evaluates to NULL and no rows are visible.
-- erp_system : BYPASSRLS. Used only for auth, tenant provisioning and background jobs.
--
-- Every new tenant table needs: ENABLE ROW LEVEL SECURITY, a tenant_isolation policy and
-- explicit grants. A test in apps/api checks that no table with institute_id lacks a policy.

CREATE FUNCTION app_institute_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.institute_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Plain tenant tables: visible and writable only inside the current institute.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON roles
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON role_permissions
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON academic_years
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON terms
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs
  USING (institute_id = app_institute_id()) WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint

-- A user may also read their own memberships in other institutes (to switch context), but
-- can only create memberships in the current one.
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON user_roles
  USING (institute_id = app_institute_id() OR user_id = app_user_id())
  WITH CHECK (institute_id = app_institute_id());
--> statement-breakpoint

-- Users are global identities: visible to themselves and to institutes where they hold a role.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY visible_users ON users
  USING (
    id = app_user_id()
    OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = users.id AND ur.institute_id = app_institute_id())
  );
--> statement-breakpoint

ALTER TABLE institutes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY own_institute ON institutes
  USING (id = app_institute_id()) WITH CHECK (id = app_institute_id());
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY own_organization ON organizations
  USING (id = (SELECT organization_id FROM institutes WHERE id = app_institute_id()));
--> statement-breakpoint

-- System-only tables: RLS on with no policy denies every role without BYPASSRLS.
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Grants. Column-level UPDATE grants stop an institute admin from changing identity or
-- privilege columns (phone, is_platform_admin, subdomain, organization_id).
GRANT USAGE ON SCHEMA public TO erp_app, erp_system;
--> statement-breakpoint
GRANT SELECT ON permissions, plans, organizations TO erp_app;
--> statement-breakpoint
GRANT SELECT ON institutes, users TO erp_app;
--> statement-breakpoint
GRANT UPDATE (name, board, settings, updated_at) ON institutes TO erp_app;
--> statement-breakpoint
GRANT UPDATE (name, updated_at) ON users TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON roles, role_permissions, user_roles, academic_years, terms TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_system;
--> statement-breakpoint
-- The audit log is append-only for everyone.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM erp_app, erp_system;
