import { NextRequest, NextResponse } from "next/server";
import { getFavoriteVessels, toggleFavoriteVessel } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

interface FavoritePayload {
  vesselId?: string;
  favorite?: boolean;
}

export async function GET() {
  return NextResponse.json({
    favorites: getFavoriteVessels(),
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as FavoritePayload;
  if (!payload.vesselId || payload.vesselId.trim().length === 0) {
    return NextResponse.json(
      {
        error: "vesselId is required.",
      },
      { status: 400 },
    );
  }

  const result = toggleFavoriteVessel(payload.vesselId, payload.favorite);
  return NextResponse.json({
    vesselId: payload.vesselId,
    isFavorite: result.isFavorite,
    favorites: result.favorites,
  });
}
