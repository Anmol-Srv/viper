// Server-only: the portal's own login gate (SPEC §1.1, dogfooding the auth service via the
// prj_viper open-enrollment project). Mirrors template/lib/auth.ts's shape, but portal has no
// clientSecret of its own — it authenticates to the auth service as an operator via
// `x-viper-admin` instead of a project Bearer token (see CONTRACT.md).
import { cookies } from "next/headers";

export type PortalUser = { email: string; role: string };

const DEV_USER: PortalUser = { email: "dev@airtribe.live", role: "owner" };

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
const ADMIN_KEY = process.env.AUTH_ADMIN_KEY || "";

/**
 * Returns the signed-in portal user, or null. Never trust a client-supplied user object — this
 * is the only source of truth, re-verified against the auth service on every call.
 *
 * PORTAL_DEV_BYPASS=1 skips the login wall entirely (see .env.example) — do not set it anywhere
 * the portal is meant to be gated for real.
 */
export async function getPortalUser(): Promise<PortalUser | null> {
  if (process.env.PORTAL_DEV_BYPASS === "1") return DEV_USER;

  const token = (await cookies()).get("viper_portal_session")?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${AUTH}/session/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-viper-admin": ADMIN_KEY },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { email: data.user.email, role: data.role };
  } catch {
    // Auth service unreachable — fail closed.
    return null;
  }
}
