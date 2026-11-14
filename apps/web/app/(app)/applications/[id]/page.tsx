import { notFound } from "next/navigation";
import { withUser } from "@shortlisted/db";
import { requireUser } from "@/lib/session";
import { getApplicationView } from "@/lib/applications";
import { ApplicationLive } from "@/components/application-live";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const initial = await getApplicationView(user.id, id);
  if (!initial) notFound();
  const profile = await withUser(user.id, (tx) => tx.profile.findUnique({ where: { userId: user.id }, select: { fullName: true } }));
  return <ApplicationLive initial={initial} fullName={profile?.fullName ?? "[Your name]"} />;
}
