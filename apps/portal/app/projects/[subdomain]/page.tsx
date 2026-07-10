import { redirect, notFound } from "next/navigation";
import { getPortalUser } from "@/lib/session";
import * as store from "@/lib/store";
import * as coolify from "@/lib/coolify";
import ProjectDetailClient from "./project-detail-client";

// Server component: resolves the record + caller's membership server-side (never trust the
// client for who-can-see-what), then hands a stripped-down record to the interactive tabs.
export default async function ProjectDetailPage({ params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/login");

  const rec = store.getBySubdomain(subdomain);
  if (!rec) notFound();

  const isPlatformAdmin = user.role === "owner"; // prj_viper "owner" role = platform admin
  const membership = (rec.members || []).find((m) => m.email === user.email);
  const isMember = rec.ownerEmail === user.email || Boolean(membership);
  if (!isMember && !isPlatformAdmin) notFound();

  const { deployTokenHash, clientSecret, ...safe } = rec;
  const myRole = membership?.role || (rec.ownerEmail === user.email ? "owner" : isPlatformAdmin ? "owner" : "member");
  const liveUrl = rec.coolify?.url || coolify.liveUrlFor(rec.subdomain);

  return <ProjectDetailClient project={safe} myRole={myRole} liveUrl={liveUrl} />;
}
