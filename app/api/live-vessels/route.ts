import { NextRequest, NextResponse } from "next/server";
import { CommodityConfidenceLabel, CommodityType, DetectionPhase, MapMode } from "@/lib/types";
import { getLiveEvaluationPayload, getLiveValidationPayload, getRadarFeed } from "@/lib/radar/service";

function toBoolean(value: string | null) {
  return value === "1" || value === "true";
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 512);
}

export async function GET(request: NextRequest) {
  try {
    const detectionPhase = request.nextUrl.searchParams.get("detectionPhase") as DetectionPhase | "All" | null;
    const destinationPortCode = request.nextUrl.searchParams.get("destination") as string | null;
    const departurePortCode = request.nextUrl.searchParams.get("departurePort") as string | null;
    const departureCountry = request.nextUrl.searchParams.get("departureCountry") as string | null;
    const maritimeZone = request.nextUrl.searchParams.get("maritimeZone") as string | null;
    const mostLikelyCommodity = request.nextUrl.searchParams.get("commodity") as CommodityType | "All" | null;
    const commodityConfidenceLabel = request.nextUrl.searchParams.get("commodityConfidence") as
      | CommodityConfidenceLabel
      | "All"
      | null;
    const mapMode = request.nextUrl.searchParams.get("mapMode") as MapMode | null;
    const maxDays = request.nextUrl.searchParams.get("maxDays");
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const includeDebug = toBoolean(request.nextUrl.searchParams.get("debug"));
    const includeEvaluation = toBoolean(request.nextUrl.searchParams.get("evaluation"));
    const windowHours = Number(request.nextUrl.searchParams.get("windowHours") ?? 48);

    const feed = await getRadarFeed({
      detectionPhase: detectionPhase ?? "All",
      destinationPortCode: destinationPortCode ?? "All",
      departurePortCode: departurePortCode ?? "All",
      departureCountry: departureCountry ?? "All",
      maritimeZone: maritimeZone ?? "All",
      maxEstimatedDaysToMorocco: maxDays ? Number(maxDays) : null,
      mostLikelyCommodity: mostLikelyCommodity ?? "All",
      commodityConfidenceLabel: commodityConfidenceLabel ?? "All",
      onlyRecentDepartures: toBoolean(request.nextUrl.searchParams.get("recentOnly")),
      onlyHighAgriCargo: toBoolean(request.nextUrl.searchParams.get("highAgriOnly")),
      mapMode: mapMode ?? "all_tracked_vessels",
      search,
    });

    const debugPayload = includeDebug ? await getLiveValidationPayload(feed) : null;
    const evaluationPayload = includeEvaluation
      ? await getLiveEvaluationPayload(feed, { windowHours })
      : null;

    const response = NextResponse.json({
      updatedAt: new Date().toISOString(),
      count: feed.vessels.length,
      vessels: feed.vessels,
      source: feed.source,
      warning: feed.warning ?? null,
      debug: debugPayload,
      evaluation: evaluationPayload,
    });

    if (feed.warning) {
      response.headers.set("x-radar-warning", sanitizeHeaderValue(feed.warning));
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected live-vessels API error";
    return NextResponse.json(
      {
        error: message,
        guidance: "Set RADAR_DATA_MODE=mock to continue using mock AIS data.",
      },
      { status: 503 },
    );
  }
}
