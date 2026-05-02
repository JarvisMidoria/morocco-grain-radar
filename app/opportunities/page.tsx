import { OpportunityBoardView } from "@/components/opportunities/opportunity-board-view";
import { getRadarFeed } from "@/lib/radar/service";
import { buildTraderOpportunityBoard } from "@/lib/trader/opportunities";
import { buildWorkflowDashboard } from "@/lib/workflow/sync";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const feed = await getRadarFeed();
  const workflow = await buildWorkflowDashboard(feed);
  const board = buildTraderOpportunityBoard(feed, workflow);

  return <OpportunityBoardView board={board} />;
}
