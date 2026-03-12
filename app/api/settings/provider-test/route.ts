import { NextRequest, NextResponse } from "next/server";
import { testProviderConnection } from "@/lib/settings/provider-test";
import { ProviderId, updateProviderStatus } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

interface ProviderTestPayload {
  provider?: ProviderId;
  apiKey?: string;
}

function isProvider(value: string | undefined): value is ProviderId {
  return (
    value === "aisstream" ||
    value === "globalFishingWatch" ||
    value === "vesselfinder" ||
    value === "datalastic" ||
    value === "marinetraffic"
  );
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as ProviderTestPayload;
  if (!isProvider(payload.provider)) {
    return NextResponse.json(
      {
        error: "Invalid provider identifier.",
      },
      { status: 400 },
    );
  }

  const result = await testProviderConnection(payload.provider, payload.apiKey);
  updateProviderStatus(payload.provider, result.status, {
    error: result.status === "error" || result.status === "invalid" ? result.message : null,
    testedAt: result.testedAt,
  });

  return NextResponse.json({
    result,
  });
}
