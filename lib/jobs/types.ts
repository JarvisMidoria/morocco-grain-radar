export type RadarJobType = "workflow_sync" | "morning_brief_archive";
export type RadarJobStatus = "success" | "failed";
export type RadarJobTrigger = "manual_api" | "scheduled_api" | "system";
export type RadarJobsClearScope = "all" | "runs" | "archives";

export interface RadarJobRunRecord {
  id: string;
  jobType: RadarJobType;
  status: RadarJobStatus;
  trigger: RadarJobTrigger;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sourceLabel: string | null;
  sourceMode: "mock" | "live" | null;
  sourceProvider: string | null;
  trackedVessels: number;
  openAlerts: number;
  highConfidenceCargoes: number;
  recentChanges: number;
  message: string | null;
  error: string | null;
}

export interface MorningBriefArchiveRecord {
  id: string;
  generatedAt: string;
  sourceLabel: string | null;
  sourceMode: "mock" | "live" | null;
  sourceProvider: string | null;
  trackedVessels: number;
  arrivalsNext7Days: number;
  highConfidenceCargoes: number;
  openAlerts: number;
  watchlistsWithMatches: number;
  topVessels: Array<{
    vesselId: string;
    vesselName: string;
    destinationPort: string;
    eta: string;
    commodity: string;
    priorityScore: number;
  }>;
  notes: string[];
  text: string;
  csv: string;
}

export interface RadarJobsStore {
  version: number;
  jobRuns: RadarJobRunRecord[];
  morningBriefArchives: MorningBriefArchiveRecord[];
  lastWorkflowSyncRunId: string | null;
  lastMorningBriefArchiveId: string | null;
}

export interface RadarJobsDashboardPayload {
  generatedAt: string;
  summary: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    archivedBriefs: number;
    lastWorkflowSyncAt: string | null;
    lastMorningBriefAt: string | null;
  };
  latestWorkflowSync: RadarJobRunRecord | null;
  latestMorningBriefArchive: MorningBriefArchiveRecord | null;
  recentRuns: RadarJobRunRecord[];
  recentArchives: MorningBriefArchiveRecord[];
  notes: string[];
}
