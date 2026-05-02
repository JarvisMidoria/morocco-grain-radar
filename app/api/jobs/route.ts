import { NextRequest, NextResponse } from "next/server";
import { authorizeJobsRequest } from "@/lib/jobs/auth";
import { clearJobsHistoryAsync } from "@/lib/jobs/store";
import { getJobsDashboard } from "@/lib/jobs/service";
import { RadarJobsClearScope } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";

function isClearScope(value: string | null): value is RadarJobsClearScope {
  return value === "all" || value === "runs" || value === "archives";
}

export async function GET() {
  return NextResponse.json(await getJobsDashboard());
}

export async function DELETE(request: NextRequest) {
  if (!authorizeJobsRequest(request)) {
    return NextResponse.json({ error: "Unauthorized job trigger." }, { status: 401 });
  }

  const scope = request.nextUrl.searchParams.get("scope");
  if (!isClearScope(scope)) {
    return NextResponse.json({ error: "Invalid jobs clear scope." }, { status: 400 });
  }

  await clearJobsHistoryAsync(scope);
  return NextResponse.json({
    scope,
    dashboard: await getJobsDashboard(),
  });
}
