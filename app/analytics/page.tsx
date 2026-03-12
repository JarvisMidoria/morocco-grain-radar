import { AnalyticsCharts } from "@/components/analytics/analytics-charts";
import { getAnalyticsPayload, getRadarVessels } from "@/lib/radar/service";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const vessels = await getRadarVessels();
  const analytics = getAnalyticsPayload(vessels);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500">
          Early-detection analytics focused on departures, phases, corridors, and commodity hypotheses.
        </p>
      </div>

      <AnalyticsCharts analytics={analytics} />
    </div>
  );
}
