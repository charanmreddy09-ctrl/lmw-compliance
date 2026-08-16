/* Permission checks. Kept in one place so server and client agree. */
export type Permission =
  | 'score.view.all' | 'score.view.country'
  | 'reports.generate' | 'delegation.manage' | 'users.manage'
  | 'compliance.file' | 'compliance.review' | 'compliance.library' | 'compliance.verify'
  | 'duedate.manage' | 'audit.view';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  roleName: string;
  permissions: Permission[];
  entities: string[];      // '*' means all
  canFile: string[];
  canReview: string[];
  /** Compliance categories ("laws") this user is restricted to — null means
      unrestricted (every category). Assigned by an Admin when creating or
      editing a preparer; every other role is unrestricted by default. */
  allowedCategories: string[] | null;
  /** Set on account creation and on an admin-triggered password reset - the
      account is usable immediately but every route except the password
      change itself (see lib/api.ts's auth()) is blocked until it's cleared,
      so a freshly issued or reset password can't quietly persist forever. */
  mustReset: boolean;
};

export function can(user: SessionUser | null, perm: Permission): boolean {
  if (!user) return false;
  return user.permissions.includes(perm);
}

export function hasAnyEntity(user: SessionUser | null): boolean {
  return !!user && user.entities.length > 0;
}

export function scopeEntities(user: SessionUser | null): string[] | 'all' {
  if (!user) return [];
  return user.entities.includes('*') ? 'all' : user.entities;
}

export function canSeeEntity(user: SessionUser | null, entityId: string): boolean {
  if (!user) return false;
  return user.entities.includes('*') || user.entities.includes(entityId);
}

export function canReviewEntity(user: SessionUser | null, entityId: string): boolean {
  if (!user) return false;
  if (!can(user, 'compliance.review')) return false;
  return user.canReview.includes('*') || user.canReview.includes(entityId);
}

export function canFileEntity(user: SessionUser | null, entityId: string): boolean {
  if (!user) return false;
  if (!can(user, 'compliance.file')) return false;
  return user.canFile.includes('*') || user.canFile.includes(entityId);
}

export function canSeeCategory(user: SessionUser | null, categoryId: string): boolean {
  if (!user) return false;
  return user.allowedCategories === null || user.allowedCategories.includes(categoryId);
}

/** The CFO deliberately does not review individual filings. */
export const ROLE_LANDING: Record<string, string> = {
  CFO: '/dashboard',
  CFO_OFFICE: '/dashboard',
  COUNTRY_HEAD: '/dashboard',
  REVIEWER: '/reviews',
  PREPARER: '/register',
  ADMIN: '/admin',
  AUDITOR: '/dashboard',
};
