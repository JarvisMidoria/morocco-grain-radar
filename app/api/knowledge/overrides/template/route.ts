import { NextRequest, NextResponse } from "next/server";
import { buildKnowledgeCsvTemplate, KnowledgeOverrideKind } from "@/lib/knowledge/overrides";

export const dynamic = "force-dynamic";

function isKind(value: unknown): value is KnowledgeOverrideKind {
  return value === "export_origins" || value === "terminals" || value === "morocco_destinations";
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  if (!isKind(kind)) {
    return NextResponse.json({ error: "Invalid override kind." }, { status: 400 });
  }

  return new NextResponse(buildKnowledgeCsvTemplate(kind), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="knowledge-${kind}-template.csv"`,
    },
  });
}
