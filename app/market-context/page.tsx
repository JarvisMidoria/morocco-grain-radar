import { MarketContextView } from "@/components/market/market-context-view";
import { getRadarFeed } from "@/lib/radar/service";
import { buildMarketContextDashboard } from "@/lib/market/context";

export const dynamic = "force-dynamic";

export default async function MarketContextPage() {
  const feed = await getRadarFeed();
  const dashboard = buildMarketContextDashboard(feed);

  return <MarketContextView dashboard={dashboard} />;
}
