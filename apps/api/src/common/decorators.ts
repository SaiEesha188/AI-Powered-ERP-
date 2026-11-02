import type { PermissionCode } from '@erp/shared';
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'erp:public';
export const IS_PLATFORM_ADMIN = 'erp:platform-admin';
export const REQUIRED_PERMISSIONS = 'erp:permissions';

/** Skips authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to the SaaS provider's own team. */
export const PlatformAdmin = () => SetMetadata(IS_PLATFORM_ADMIN, true);

/**
 * Requires an X-Institute-Id header for an institute the caller belongs to, and every listed
 * permission there. Data access inside the handler is then limited to that institute by RLS.
 */
export const RequirePermissions = (...codes: PermissionCode[]) => SetMetadata(REQUIRED_PERMISSIONS, codes);

/**
 * Requires membership of the institute in X-Institute-Id but no permission. For /family routes,
 * whose handlers check the caller's own relationship to the record instead.
 */
export const RequireInstitute = () => RequirePermissions();
