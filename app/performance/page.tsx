import { ModelPerformanceView } from "@/components/performance/model-performance-view";
import { getRadarFeed } from "@/lib/radar/service";
import { buildModelPerformanceDashboard } from "@/lib/workflow/performance";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const feed = await getRadarFeed();
  const dashboard = await buildModelPerformanceDashboard(feed);

  return <ModelPerformanceView dashboard={dashboard} />;
}
