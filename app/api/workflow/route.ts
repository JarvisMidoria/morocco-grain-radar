import { NextRequest, NextResponse } from "next/server";
import { getRadarFeed } from "@/lib/radar/service";
import {
  acknowledgeWorkflowAlert,
  buildWorkflowDashboard,
  deleteWorkflowAlertRule,
  deleteWorkflowWatchlist,
  upsertWorkflowAlertRule,
  upsertWorkflowWatchlist,
} from "@/lib/workflow/sync";
import { UpsertAlertRuleInput, UpsertWatchlistInput } from "@/lib/workflow/types";

export const dynamic = "force-dynamic";

type WorkflowActionPayload =
  | { action: "create_watchlist"; payload: UpsertWatchlistInput }
  | { action: "update_watchlist"; payload: UpsertWatchlistInput }
  | { action: "delete_watchlist"; watchlistId: string }
  | { action: "create_alert_rule"; payload: UpsertAlertRuleInput }
  | { action: "update_alert_rule"; payload: UpsertAlertRuleInput }
  | { action: "delete_alert_rule"; ruleId: string }
  | { action: "acknowledge_alert"; alertId: string };

async function getDashboardResponse() {
  const feed = await getRadarFeed();
  return NextResponse.json({
    dashboard: await buildWorkflowDashboard(feed),
  });
}

export async function GET() {
  return getDashboardResponse();
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as WorkflowActionPayload;

  if (payload.action === "create_watchlist" || payload.action === "update_watchlist") {
    if (!payload.payload?.name || payload.payload.name.trim().length === 0) {
      return NextResponse.json({ error: "watchlist name is required" }, { status: 400 });
    }
    await upsertWorkflowWatchlist(payload.payload);
    return getDashboardResponse();
  }

  if (payload.action === "delete_watchlist") {
    if (!payload.watchlistId) {
      return NextResponse.json({ error: "watchlistId is required" }, { status: 400 });
    }
    await deleteWorkflowWatchlist(payload.watchlistId);
    return getDashboardResponse();
  }

  if (payload.action === "create_alert_rule" || payload.action === "update_alert_rule") {
    if (!payload.payload?.name || payload.payload.name.trim().length === 0) {
      return NextResponse.json({ error: "rule name is required" }, { status: 400 });
    }
    await upsertWorkflowAlertRule(payload.payload);
    return getDashboardResponse();
  }

  if (payload.action === "delete_alert_rule") {
    if (!payload.ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }
    await deleteWorkflowAlertRule(payload.ruleId);
    return getDashboardResponse();
  }

  if (payload.action === "acknowledge_alert") {
    if (!payload.alertId) {
      return NextResponse.json({ error: "alertId is required" }, { status: 400 });
    }
    await acknowledgeWorkflowAlert(payload.alertId);
    return getDashboardResponse();
  }

  return NextResponse.json({ error: "Unsupported workflow action." }, { status: 400 });
}
