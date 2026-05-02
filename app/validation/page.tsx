import { ValidationView } from "@/components/validation/validation-view";
import { getRadarFeed } from "@/lib/radar/service";
import { buildValidationDashboard } from "@/lib/workflow/sync";

export const dynamic = "force-dynamic";

export default async function ValidationPage() {
  const feed = await getRadarFeed();
  const dashboard = await buildValidationDashboard(feed);

  return <ValidationView dashboard={dashboard} />;
}
