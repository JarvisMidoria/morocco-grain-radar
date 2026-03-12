import { NextResponse } from "next/server";
import { getRadarRuntimeConfig } from "@/lib/radar/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getRadarRuntimeConfig();

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    mode: runtime.mode,
    provider: runtime.provider,
    liveProviderImplemented: runtime.liveProviderImplemented,
    validationError: runtime.validationError,
  });
}
