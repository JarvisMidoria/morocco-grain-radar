import { RiskDashboardView } from "@/components/risk/risk-dashboard-view";
import { getRadarFeed } from "@/lib/radar/service";
import { buildPortfolioRiskDashboard } from "@/lib/risk/assessment";

export const dynamic = "force-dynamic";

export default async function RiskPage() {
  const feed = await getRadarFeed();
  const dashboard = buildPortfolioRiskDashboard(feed.vessels);

  return <RiskDashboardView dashboard={dashboard} />;
}
