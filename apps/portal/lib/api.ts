// Client-side fetch wrapper: a 401 means the portal session cookie expired mid-visit. A bare
// fetch() would leave the page stuck showing stale data with no way back in — this redirects to
// /login instead of letting the UI strand the user. Use for client-component fetches to portal
// API routes guarded by getPortalUser() (not /api/auth/* or /api/deploy, which aren't session-gated).
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  return res;
}
