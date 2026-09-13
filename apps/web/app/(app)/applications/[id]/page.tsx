import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getApplicationView } from "@/lib/applications";
import { ApplicationLive } from "@/components/application-live";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const initial = await getApplicationView(user.id, id);
  if (!initial) notFound();
  return <ApplicationLive initial={initial} />;
}
