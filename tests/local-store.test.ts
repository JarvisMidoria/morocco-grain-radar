import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before, beforeEach } from "node:test";
import type {
  MorningBriefArchiveRecord,
  RadarJobRunRecord,
  RadarJobsStore,
} from "../lib/jobs/types";

const tempStoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "morocco-grain-radar-tests-"));
process.env.RADAR_LOCAL_STORE_DIR = tempStoreDir;
process.env.RADAR_DISABLE_PRISMA_APP_STATE = "true";

let jobsStoreModule: typeof import("../lib/jobs/store");
let jobsServiceModule: typeof import("../lib/jobs/service");
let knowledgeModule: typeof import("../lib/knowledge/overrides");
let workflowStoreModule: typeof import("../lib/workflow/store");

before(async () => {
  jobsStoreModule = await import("../lib/jobs/store.ts");
  jobsServiceModule = await import("../lib/jobs/service.ts");
  knowledgeModule = await import("../lib/knowledge/overrides.ts");
  workflowStoreModule = await import("../lib/workflow/store.ts");
});

function createRun(partial: Partial<RadarJobRunRecord> = {}): RadarJobRunRecord {
  return {
    id: partial.id ?? "jobrun_test",
    jobType: partial.jobType ?? "workflow_sync",
    status: partial.status ?? "success",
    trigger: partial.trigger ?? "manual_api",
    startedAt: partial.startedAt ?? "2026-05-02T08:00:00.000Z",
    finishedAt: partial.finishedAt ?? "2026-05-02T08:00:10.000Z",
    durationMs: partial.durationMs ?? 10_000,
    sourceLabel: partial.sourceLabel ?? "Mock radar",
    sourceMode: partial.sourceMode ?? "mock",
    sourceProvider: partial.sourceProvider ?? "mock",
    trackedVessels: partial.trackedVessels ?? 12,
    openAlerts: partial.openAlerts ?? 3,
    highConfidenceCargoes: partial.highConfidenceCargoes ?? 4,
    recentChanges: partial.recentChanges ?? 2,
    message: partial.message ?? "Completed",
    error: partial.error ?? null,
  };
}

function createArchive(partial: Partial<MorningBriefArchiveRecord> = {}): MorningBriefArchiveRecord {
  return {
    id: partial.id ?? "brief_test",
    generatedAt: partial.generatedAt ?? "2026-05-02T08:05:00.000Z",
    sourceLabel: partial.sourceLabel ?? "Mock radar",
    sourceMode: partial.sourceMode ?? "mock",
    sourceProvider: partial.sourceProvider ?? "mock",
    trackedVessels: partial.trackedVessels ?? 12,
    arrivalsNext7Days: partial.arrivalsNext7Days ?? 5,
    highConfidenceCargoes: partial.highConfidenceCargoes ?? 4,
    openAlerts: partial.openAlerts ?? 3,
    watchlistsWithMatches: partial.watchlistsWithMatches ?? 2,
    topVessels: partial.topVessels ?? [
      {
        vesselId: "vsl-atlas-harvest",
        vesselName: "Atlas Harvest",
        destinationPort: "Casablanca",
        eta: "2026-05-05T12:00:00.000Z",
        commodity: "wheat",
        priorityScore: 91,
      },
    ],
    notes: partial.notes ?? ["Archive created in test"],
    text: partial.text ?? "Morning brief body",
    csv: partial.csv ?? "vesselId,vesselName\nvsl-atlas-harvest,Atlas Harvest",
  };
}

beforeEach(() => {
  jobsStoreModule.clearJobsHistory("all");
  knowledgeModule.clearKnowledgeOverrides("all");
  const workflowStore = workflowStoreModule.getWorkflowStore({ bypassCache: true });
  workflowStoreModule.saveWorkflowStore({
    ...workflowStore,
    alerts: [],
    vesselSnapshots: [],
    vesselChangeEvents: [],
    analystFeedback: [],
    analystFeedbackAuditEvents: [],
    validatedVoyages: [],
    lastFeedSignature: null,
    lastSyncAt: null,
    lastSource: null,
  });
});

after(() => {
  fs.rmSync(tempStoreDir, { recursive: true, force: true });
  delete process.env.RADAR_LOCAL_STORE_DIR;
  delete process.env.RADAR_DISABLE_PRISMA_APP_STATE;
});

test("jobs store writes into the configured local store directory", () => {
  const store = jobsStoreModule.getJobsStore({ bypassCache: true });
  assert.equal(store.version, 1);
  assert.deepEqual(store.jobRuns, []);
  assert.ok(fs.existsSync(path.join(tempStoreDir, "jobs.json")));
});

test("jobs dashboard summarizes runs and archives from the local store", async () => {
  jobsStoreModule.updateJobsStore((store: RadarJobsStore) => ({
    ...store,
    jobRuns: [
      ...store.jobRuns,
      createRun({
        id: "jobrun_sync_1",
        jobType: "workflow_sync",
        finishedAt: "2026-05-02T09:00:00.000Z",
      }),
      createRun({
        id: "jobrun_brief_1",
        jobType: "morning_brief_archive",
        finishedAt: "2026-05-02T09:05:00.000Z",
        trackedVessels: 14,
      }),
    ],
    morningBriefArchives: [
      ...store.morningBriefArchives,
      createArchive({
        id: "brief_1",
        generatedAt: "2026-05-02T09:05:00.000Z",
      }),
    ],
    lastWorkflowSyncRunId: "jobrun_sync_1",
    lastMorningBriefArchiveId: "brief_1",
  }));

  const dashboard = await jobsServiceModule.getJobsDashboard();
  assert.equal(dashboard.summary.totalRuns, 2);
  assert.equal(dashboard.summary.successfulRuns, 2);
  assert.equal(dashboard.summary.archivedBriefs, 1);
  assert.equal(dashboard.latestWorkflowSync?.id, "jobrun_sync_1");
  assert.equal(dashboard.latestMorningBriefArchive?.id, "brief_1");
});

test("jobs history can clear only archives without dropping execution runs", () => {
  jobsStoreModule.updateJobsStore((store: RadarJobsStore) => ({
    ...store,
    jobRuns: [...store.jobRuns, createRun({ id: "jobrun_sync_2" })],
    morningBriefArchives: [...store.morningBriefArchives, createArchive({ id: "brief_2" })],
    lastWorkflowSyncRunId: "jobrun_sync_2",
    lastMorningBriefArchiveId: "brief_2",
  }));

  jobsStoreModule.clearJobsHistory("archives");
  const store = jobsStoreModule.getJobsStore({ bypassCache: true });
  assert.equal(store.jobRuns.length, 1);
  assert.equal(store.morningBriefArchives.length, 0);
  assert.equal(store.lastWorkflowSyncRunId, "jobrun_sync_2");
  assert.equal(store.lastMorningBriefArchiveId, null);
});

test("knowledge overrides append merges on port identity and replace resets the set", () => {
  knowledgeModule.importKnowledgeOverrideCsv({
    kind: "morocco_destinations",
    mode: "append",
    csv: [
      "id,portId,portName,aliases,grainRelevance,feedRelevance,wheatScore,barleyScore,cornScore,soybeanMealScore,confidenceWeight,likelySourceRegions",
      'override-kb-dest-kenitra,override-dest-kenitra,Kenitra,"kenitra|mehdiya",medium,low,7,4,5,2,0.68,"western_europe|western_mediterranean"',
    ].join("\n"),
  });
  knowledgeModule.importKnowledgeOverrideCsv({
    kind: "morocco_destinations",
    mode: "append",
    csv: [
      "id,portId,portName,aliases,grainRelevance,feedRelevance,wheatScore,barleyScore,cornScore,soybeanMealScore,confidenceWeight,likelySourceRegions",
      'override-kb-dest-kenitra-b,override-dest-kenitra,Kenitra,"kenitra|atlantic",high,medium,9,4,6,2,0.74,"western_europe|south_atlantic"',
    ].join("\n"),
  });

  let store = knowledgeModule.getKnowledgeOverrideStore();
  assert.equal(store.moroccoDestinations.length, 1);
  assert.equal(store.moroccoDestinations[0]?.grainRelevance, "high");
  assert.deepEqual(store.moroccoDestinations[0]?.aliases, ["kenitra", "atlantic"]);

  knowledgeModule.importKnowledgeOverrideCsv({
    kind: "morocco_destinations",
    mode: "replace",
    csv: [
      "id,portId,portName,aliases,grainRelevance,feedRelevance,wheatScore,barleyScore,cornScore,soybeanMealScore,confidenceWeight,likelySourceRegions",
      'override-kb-dest-safi,override-dest-safi,Safi,"safi",low,high,3,5,7,1,0.61,"south_atlantic"',
    ].join("\n"),
  });

  store = knowledgeModule.getKnowledgeOverrideStore();
  assert.equal(store.moroccoDestinations.length, 1);
  assert.equal(store.moroccoDestinations[0]?.portName, "Safi");
});

test("knowledge CSV templates expose the expected headers", () => {
  const template = knowledgeModule.buildKnowledgeCsvTemplate("terminals");
  assert.match(
    template,
    /^id,exportPortId,portId,portName,portAliases,terminalName,terminalAliases,terminalType,/,
  );
});

test("workflow async persistence falls back to the local file store when db is unavailable", async () => {
  const updated = await workflowStoreModule.updateWorkflowStoreAsync((store) => ({
    ...store,
    lastSyncAt: "2026-05-02T10:15:00.000Z",
  }));

  assert.equal(updated.lastSyncAt, "2026-05-02T10:15:00.000Z");

  const reloaded = await workflowStoreModule.getWorkflowStoreAsync({ bypassCache: true });
  const info = await workflowStoreModule.getWorkflowPersistenceInfo();

  assert.equal(reloaded.lastSyncAt, "2026-05-02T10:15:00.000Z");
  assert.equal(info.backend, "file");
  assert.ok(fs.existsSync(path.join(tempStoreDir, "workflow.json")));
});
