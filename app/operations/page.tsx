import { ExecutionDashboardView } from "@/components/operations/execution-dashboard-view";
import { buildMoroccoExecutionDashboard } from "@/lib/operations/morocco-execution";
import { getRadarFeed } from "@/lib/radar/service";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const feed = await getRadarFeed();
  const dashboard = buildMoroccoExecutionDashboard(feed);

  return <ExecutionDashboardView dashboard={dashboard} />;
}
