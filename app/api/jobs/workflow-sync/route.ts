import { NextRequest, NextResponse } from "next/server";
import { authorizeJobsRequest } from "@/lib/jobs/auth";
import { getJobsDashboard, runWorkflowSyncJob } from "@/lib/jobs/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const dashboard = await getJobsDashboard();
  return NextResponse.json({
    latestWorkflowSync: dashboard.latestWorkflowSync,
    summary: dashboard.summary,
  });
}

export async function POST(request: NextRequest) {
  if (!authorizeJobsRequest(request)) {
    return NextResponse.json({ error: "Unauthorized job trigger." }, { status: 401 });
  }

  try {
    const result = await runWorkflowSyncJob("manual_api");
    return NextResponse.json({
      run: result.run,
      trackedVessels: result.feed.vessels.length,
      openAlerts: result.dashboard.alerts.filter((alert) => alert.status === "open").length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workflow sync job failed." },
      { status: 500 },
    );
  }
}
