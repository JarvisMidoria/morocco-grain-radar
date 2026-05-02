import { KnowledgeBaseView } from "@/components/knowledge/knowledge-base-view";
import { getKnowledgeBaseCatalog } from "@/lib/knowledge/catalog";
import { getKnowledgeOverrideSummary } from "@/lib/knowledge/overrides";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  const catalog = getKnowledgeBaseCatalog();
  const overrideSummary = getKnowledgeOverrideSummary();

  return <KnowledgeBaseView catalog={catalog} overrideSummary={overrideSummary} />;
}
