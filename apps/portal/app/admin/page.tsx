import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/session";
import AdminClient from "./admin-client";

// Platform admin dashboard (SPEC B1) — THE gate: only people this page lists can log into the
// portal at all (auth service's prj_viper membership, invite-only per SPEC A2). Routable only
// when the caller's prj_viper role is "owner" — server-gated, not just a hidden nav link.
export default async function AdminPage() {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/");

  return <AdminClient me={user} />;
}
