import { NextRequest, NextResponse } from "next/server";
import { getRadarFeed } from "@/lib/radar/service";
import {
  exportMorningBriefCsv,
  exportMorningBriefText,
  exportWatchlistCsv,
} from "@/lib/workflow/sync";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const kind = searchParams.get("kind");
  const watchlistId = searchParams.get("watchlistId");
  const feed = await getRadarFeed();

  if (kind === "morning-brief-csv") {
    return new NextResponse(await exportMorningBriefCsv(feed), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="morocco-grain-radar-morning-brief.csv"',
      },
    });
  }

  if (kind === "morning-brief-text") {
    return new NextResponse(await exportMorningBriefText(feed), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="morocco-grain-radar-morning-brief.txt"',
      },
    });
  }

  if (kind === "watchlist-csv" && watchlistId) {
    const exported = await exportWatchlistCsv(feed, watchlistId);
    if (!exported) {
      return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
    }

    const sanitizedName = exported.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return new NextResponse(exported.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${sanitizedName || "watchlist"}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Unsupported export kind." }, { status: 400 });
}
