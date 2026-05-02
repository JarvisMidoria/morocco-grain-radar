import { getRadarFeed } from "@/lib/radar/service";
import {
  buildMorningBrief,
  buildWorkflowDashboard,
  exportMorningBriefCsv,
  exportMorningBriefText,
} from "@/lib/workflow/sync";
import {
  createJobsIds,
  getJobsStoreAsync,
  updateJobsStoreAsync,
} from "@/lib/jobs/store";
import {
  MorningBriefArchiveRecord,
  RadarJobRunRecord,
  RadarJobsDashboardPayload,
  RadarJobTrigger,
} from "@/lib/jobs/types";

function durationMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown job error.";
}

export async function runWorkflowSyncJob(trigger: RadarJobTrigger = "manual_api") {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  try {
    const feed = await getRadarFeed();
    const dashboard = await buildWorkflowDashboard(feed);
    const finishedAt = new Date().toISOString();

    const run: RadarJobRunRecord = {
      id: createJobsIds().runId,
      jobType: "workflow_sync",
      status: "success",
      trigger,
      startedAt,
      finishedAt,
      durationMs: durationMs(startedAtMs),
      sourceLabel: feed.source.label,
      sourceMode: feed.source.mode,
      sourceProvider: feed.source.provider,
      trackedVessels: feed.vessels.length,
      openAlerts: dashboard.alerts.filter((alert) => alert.status === "open").length,
      highConfidenceCargoes: dashboard.morningBrief.summary.highConfidenceCargoes,
      recentChanges: dashboard.recentChanges.length,
      message: `Workflow sync completed for ${feed.vessels.length} vessels.`,
      error: null,
    };

    await updateJobsStoreAsync((store) => ({
      ...store,
      jobRuns: [...store.jobRuns, run],
      lastWorkflowSyncRunId: run.id,
    }));

    return { run, feed, dashboard };
  } catch (error) {
    const run: RadarJobRunRecord = {
      id: createJobsIds().runId,
      jobType: "workflow_sync",
      status: "failed",
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: durationMs(startedAtMs),
      sourceLabel: null,
      sourceMode: null,
      sourceProvider: null,
      trackedVessels: 0,
      openAlerts: 0,
      highConfidenceCargoes: 0,
      recentChanges: 0,
      message: null,
      error: errorMessage(error),
    };

    await updateJobsStoreAsync((store) => ({
      ...store,
      jobRuns: [...store.jobRuns, run],
      lastWorkflowSyncRunId: run.id,
    }));

    throw error;
  }
}

export async function runMorningBriefArchiveJob(trigger: RadarJobTrigger = "manual_api") {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  try {
    const feed = await getRadarFeed();
    const brief = await buildMorningBrief(feed);
    const text = await exportMorningBriefText(feed);
    const csv = await exportMorningBriefCsv(feed);
    const finishedAt = new Date().toISOString();

    const archive: MorningBriefArchiveRecord = {
      id: createJobsIds().archiveId,
      generatedAt: brief.generatedAt,
      sourceLabel: brief.source?.label ?? feed.source.label,
      sourceMode: brief.source?.mode ?? feed.source.mode,
      sourceProvider: brief.source?.provider ?? feed.source.provider,
      trackedVessels: brief.summary.trackedVessels,
      arrivalsNext7Days: brief.summary.arrivalsNext7Days,
      highConfidenceCargoes: brief.summary.highConfidenceCargoes,
      openAlerts: brief.summary.openAlerts,
      watchlistsWithMatches: brief.summary.watchlistsWithMatches,
      topVessels: brief.topVessels.map((entry) => ({
        vesselId: entry.vesselId,
        vesselName: entry.vesselName,
        destinationPort: entry.destinationPort,
        eta: entry.eta,
        commodity: entry.mostLikelyCommodity,
        priorityScore: entry.priorityScore,
      })),
      notes: brief.notes,
      text,
      csv,
    };

    const run: RadarJobRunRecord = {
      id: createJobsIds().runId,
      jobType: "morning_brief_archive",
      status: "success",
      trigger,
      startedAt,
      finishedAt,
      durationMs: durationMs(startedAtMs),
      sourceLabel: archive.sourceLabel,
      sourceMode: archive.sourceMode,
      sourceProvider: archive.sourceProvider,
      trackedVessels: archive.trackedVessels,
      openAlerts: archive.openAlerts,
      highConfidenceCargoes: archive.highConfidenceCargoes,
      recentChanges: brief.recentChanges.length,
      message: `Morning brief archived with ${archive.topVessels.length} top vessels.`,
      error: null,
    };

    await updateJobsStoreAsync((store) => ({
      ...store,
      jobRuns: [...store.jobRuns, run],
      morningBriefArchives: [...store.morningBriefArchives, archive],
      lastWorkflowSyncRunId:
        store.lastWorkflowSyncRunId ??
        (run.jobType === "workflow_sync" ? run.id : store.lastWorkflowSyncRunId),
      lastMorningBriefArchiveId: archive.id,
    }));

    return { run, archive, brief };
  } catch (error) {
    const run: RadarJobRunRecord = {
      id: createJobsIds().runId,
      jobType: "morning_brief_archive",
      status: "failed",
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: durationMs(startedAtMs),
      sourceLabel: null,
      sourceMode: null,
      sourceProvider: null,
      trackedVessels: 0,
      openAlerts: 0,
      highConfidenceCargoes: 0,
      recentChanges: 0,
      message: null,
      error: errorMessage(error),
    };

    await updateJobsStoreAsync((store) => ({
      ...store,
      jobRuns: [...store.jobRuns, run],
    }));

    throw error;
  }
}

function buildJobsDashboard(store: Awaited<ReturnType<typeof getJobsStoreAsync>>): RadarJobsDashboardPayload {
  const sortedRuns = store.jobRuns
    .slice()
    .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime());
  const sortedArchives = store.morningBriefArchives
    .slice()
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());

  const latestWorkflowSync =
    sortedRuns.find((run) => run.jobType === "workflow_sync") ?? null;
  const latestMorningBriefArchive =
    sortedArchives.find((archive) => archive.id === store.lastMorningBriefArchiveId) ??
    sortedArchives[0] ??
    null;

  const notes: string[] = [];
  if (latestWorkflowSync?.status === "failed") {
    notes.push("Latest workflow sync failed and should be reviewed before relying on archived briefs.");
  }
  if (latestMorningBriefArchive) {
    notes.push("Morning brief archives are stored locally and can be pulled by cron or external automation.");
  }
  if (notes.length === 0) {
    notes.push("No job archive exists yet. Trigger a workflow sync or morning brief archive to initialize the history.");
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalRuns: sortedRuns.length,
      successfulRuns: sortedRuns.filter((run) => run.status === "success").length,
      failedRuns: sortedRuns.filter((run) => run.status === "failed").length,
      archivedBriefs: sortedArchives.length,
      lastWorkflowSyncAt: latestWorkflowSync?.finishedAt ?? null,
      lastMorningBriefAt: latestMorningBriefArchive?.generatedAt ?? null,
    },
    latestWorkflowSync,
    latestMorningBriefArchive,
    recentRuns: sortedRuns.slice(0, 20),
    recentArchives: sortedArchives.slice(0, 12),
    notes,
  };
}

export async function getJobsDashboard(): Promise<RadarJobsDashboardPayload> {
  const store = await getJobsStoreAsync();
  return buildJobsDashboard(store);
}
