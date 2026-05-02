import { NextResponse } from "next/server";
import { getRadarFeed } from "@/lib/radar/service";
import { buildModelPerformanceDashboard } from "@/lib/workflow/performance";

export const dynamic = "force-dynamic";

export async function GET() {
  const feed = await getRadarFeed();
  return NextResponse.json({
    dashboard: await buildModelPerformanceDashboard(feed),
  });
}
