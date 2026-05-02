import { JobsDashboardView } from "@/components/jobs/jobs-dashboard-view";
import { getJobsDashboard } from "@/lib/jobs/service";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const dashboard = await getJobsDashboard();

  return <JobsDashboardView initialDashboard={dashboard} />;
}
