import { NextResponse } from "next/server";
import { isPrismaAvailable } from "@/lib/db/prisma";
import { getJobsDashboard } from "@/lib/jobs/service";
import { getJobsPersistenceInfo } from "@/lib/jobs/store";
import { getKnowledgeOverrideSummary } from "@/lib/knowledge/overrides";
import { getRadarRuntimeConfig } from "@/lib/radar/runtime-config";
import { getWorkflowPersistenceInfo, getWorkflowStoreAsync } from "@/lib/workflow/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getRadarRuntimeConfig();
  const [workflow, workflowPersistence, jobs, jobsPersistence] = await Promise.all([
    getWorkflowStoreAsync(),
    getWorkflowPersistenceInfo(),
    getJobsDashboard(),
    getJobsPersistenceInfo(),
  ]);
  const knowledgeOverrides = getKnowledgeOverrideSummary();

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    mode: runtime.mode,
    provider: runtime.provider,
    liveProviderImplemented: runtime.liveProviderImplemented,
    validationError: runtime.validationError,
    persistence: {
      prismaAvailable: isPrismaAvailable,
      workflowStoreMode: workflowPersistence.backend,
      jobsStoreMode: jobsPersistence.backend,
      workflowLastSyncAt: workflow.lastSyncAt,
    },
    workflow: {
      workspaces: workflow.workspaces.length,
      alerts: workflow.alerts.length,
      watchlists: workflow.workspaces.reduce((sum, workspace) => sum + workspace.watchlists.length, 0),
      analystFeedbackCases: workflow.analystFeedback.length,
      validatedVoyages: workflow.validatedVoyages.length,
      changeEvents: workflow.vesselChangeEvents.length,
    },
    knowledgeOverrides,
    jobs: {
      totalRuns: jobs.summary.totalRuns,
      archivedBriefs: jobs.summary.archivedBriefs,
      lastWorkflowSyncAt: jobs.summary.lastWorkflowSyncAt,
      lastMorningBriefAt: jobs.summary.lastMorningBriefAt,
    },
  });
}
