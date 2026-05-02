import { NextRequest, NextResponse } from "next/server";
import { getRadarFeed } from "@/lib/radar/service";
import {
  buildValidationDashboard,
  getAnalystFeedbackForVessel,
  upsertAnalystFeedback,
} from "@/lib/workflow/sync";
import { UpsertAnalystFeedbackInput } from "@/lib/workflow/types";

export const dynamic = "force-dynamic";

type ValidationActionPayload = {
  action: "upsert_feedback";
  payload: UpsertAnalystFeedbackInput;
};

async function getValidationResponse(vesselId?: string | null) {
  const feed = await getRadarFeed();

  return NextResponse.json({
    dashboard: await buildValidationDashboard(feed),
    feedback: vesselId ? await getAnalystFeedbackForVessel(vesselId) : null,
  });
}

export async function GET(request: NextRequest) {
  const vesselId = request.nextUrl.searchParams.get("vesselId");
  return getValidationResponse(vesselId);
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as ValidationActionPayload;

  if (payload.action !== "upsert_feedback") {
    return NextResponse.json({ error: "Unsupported validation action." }, { status: 400 });
  }

  if (!payload.payload?.vesselId || !payload.payload?.vesselName) {
    return NextResponse.json({ error: "vesselId and vesselName are required" }, { status: 400 });
  }

  await upsertAnalystFeedback(payload.payload);
  return getValidationResponse(payload.payload.vesselId);
}
