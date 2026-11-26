import { redirect } from "next/navigation";

interface AcknowledgmentsRedirectProps {
  searchParams?: Promise<{ tab?: string }>;
}

export default async function AcknowledgmentsRedirectPage({
  searchParams,
}: AcknowledgmentsRedirectProps) {
  const params = await searchParams;
  if (params?.tab === "completed") {
    redirect("/to-read?tab=completed");
  }
  redirect("/to-read");
}
