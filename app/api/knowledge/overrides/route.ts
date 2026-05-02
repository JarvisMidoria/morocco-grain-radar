import { NextRequest, NextResponse } from "next/server";
import {
  KnowledgeOverrideKind,
  KnowledgeOverrideMode,
  clearKnowledgeOverrides,
  getKnowledgeOverrideSummary,
  importKnowledgeOverrideCsv,
} from "@/lib/knowledge/overrides";

export const dynamic = "force-dynamic";

function isKind(value: unknown): value is KnowledgeOverrideKind {
  return value === "export_origins" || value === "terminals" || value === "morocco_destinations";
}

function isMode(value: unknown): value is KnowledgeOverrideMode {
  return value === "append" || value === "replace";
}

export async function GET() {
  return NextResponse.json({ summary: getKnowledgeOverrideSummary() });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      kind?: string;
      mode?: string;
      csv?: string;
    };

    if (!isKind(body.kind) || !isMode(body.mode) || typeof body.csv !== "string") {
      return NextResponse.json({ error: "Invalid knowledge override payload." }, { status: 400 });
    }

    const result = importKnowledgeOverrideCsv({
      kind: body.kind,
      mode: body.mode,
      csv: body.csv,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Knowledge override import failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "all" && !isKind(kind)) {
    return NextResponse.json({ error: "Invalid override kind." }, { status: 400 });
  }

  return NextResponse.json({ summary: clearKnowledgeOverrides(kind) });
}
