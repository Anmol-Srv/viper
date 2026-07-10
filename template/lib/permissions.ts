import { hasPermission } from './auth';

export { hasPermission };

/**
 * Throws if the signed-in user lacks `perm`. Use at the top of API route handlers —
 * see docs/permissions.md: gate in the route, not just the component.
 */
export async function assertPermission(perm: string): Promise<void> {
  if (!(await hasPermission(perm))) {
    throw new Error(`Forbidden: missing permission "${perm}"`);
  }
}
