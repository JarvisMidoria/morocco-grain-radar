import { NextRequest, NextResponse } from "next/server";
import { authorizeJobsRequest } from "@/lib/jobs/auth";
import { getJobsDashboard, runMorningBriefArchiveJob } from "@/lib/jobs/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dashboard = await getJobsDashboard();
  const format = request.nextUrl.searchParams.get("format");
  const latestArchive = dashboard.latestMorningBriefArchive;

  if ((format === "text" || format === "csv") && latestArchive) {
    return new NextResponse(format === "text" ? latestArchive.text : latestArchive.csv, {
      headers: {
        "Content-Type": format === "text" ? "text/plain; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition":
          format === "text"
            ? 'attachment; filename="morocco-grain-radar-archived-brief.txt"'
            : 'attachment; filename="morocco-grain-radar-archived-brief.csv"',
      },
    });
  }

  return NextResponse.json({
    latestArchive,
    archives: dashboard.recentArchives,
    summary: dashboard.summary,
  });
}

export async function POST(request: NextRequest) {
  if (!authorizeJobsRequest(request)) {
    return NextResponse.json({ error: "Unauthorized job trigger." }, { status: 401 });
  }

  try {
    const result = await runMorningBriefArchiveJob("manual_api");
    return NextResponse.json({
      run: result.run,
      archive: result.archive,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Morning brief archive job failed." },
      { status: 500 },
    );
  }
}
