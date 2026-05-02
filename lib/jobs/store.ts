import fs from "node:fs";
import path from "node:path";
import { isPrismaAvailable } from "@/lib/db/prisma";
import { PersistenceBackend, readAppState, writeAppState } from "@/lib/db/app-state";
import {
  MorningBriefArchiveRecord,
  RadarJobRunRecord,
  RadarJobsClearScope,
  RadarJobsStore,
} from "@/lib/jobs/types";
import { getRadarLocalStoreDir } from "@/lib/storage/local-store";

const CACHE_TTL_MS = 2_000;
const JOBS_STATE_NAMESPACE = "jobs-store";
const MAX_JOB_RUNS = 200;
const MAX_BRIEF_ARCHIVES = 90;

let cache: { loadedAt: number; store: RadarJobsStore; backend: PersistenceBackend } | null = null;

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getJobsDir() {
  return getRadarLocalStoreDir();
}

function getJobsFile() {
  return path.join(getJobsDir(), "jobs.json");
}

function ensureJobsDir() {
  const jobsDir = getJobsDir();
  if (!fs.existsSync(jobsDir)) {
    fs.mkdirSync(jobsDir, { recursive: true });
  }
}

function defaultStore(): RadarJobsStore {
  return {
    version: 1,
    jobRuns: [],
    morningBriefArchives: [],
    lastWorkflowSyncRunId: null,
    lastMorningBriefArchiveId: null,
  };
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeNullableText(value: unknown) {
  const text = sanitizeText(value);
  return text.length > 0 ? text : null;
}

function sanitizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeJobRun(raw: unknown): RadarJobRunRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<RadarJobRunRecord>;
  if (
    typed.jobType !== "workflow_sync" &&
    typed.jobType !== "morning_brief_archive"
  ) {
    return null;
  }
  if (typed.status !== "success" && typed.status !== "failed") {
    return null;
  }
  if (
    typed.trigger !== "manual_api" &&
    typed.trigger !== "scheduled_api" &&
    typed.trigger !== "system"
  ) {
    return null;
  }

  return {
    id: sanitizeText(typed.id) || createId("jobrun"),
    jobType: typed.jobType,
    status: typed.status,
    trigger: typed.trigger,
    startedAt: sanitizeText(typed.startedAt) || nowIso(),
    finishedAt: sanitizeText(typed.finishedAt) || nowIso(),
    durationMs: sanitizeNumber(typed.durationMs, 0),
    sourceLabel: sanitizeNullableText(typed.sourceLabel),
    sourceMode: typed.sourceMode === "mock" || typed.sourceMode === "live" ? typed.sourceMode : null,
    sourceProvider: sanitizeNullableText(typed.sourceProvider),
    trackedVessels: sanitizeNumber(typed.trackedVessels, 0),
    openAlerts: sanitizeNumber(typed.openAlerts, 0),
    highConfidenceCargoes: sanitizeNumber(typed.highConfidenceCargoes, 0),
    recentChanges: sanitizeNumber(typed.recentChanges, 0),
    message: sanitizeNullableText(typed.message),
    error: sanitizeNullableText(typed.error),
  };
}

function normalizeArchive(raw: unknown): MorningBriefArchiveRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<MorningBriefArchiveRecord>;
  return {
    id: sanitizeText(typed.id) || createId("brief"),
    generatedAt: sanitizeText(typed.generatedAt) || nowIso(),
    sourceLabel: sanitizeNullableText(typed.sourceLabel),
    sourceMode: typed.sourceMode === "mock" || typed.sourceMode === "live" ? typed.sourceMode : null,
    sourceProvider: sanitizeNullableText(typed.sourceProvider),
    trackedVessels: sanitizeNumber(typed.trackedVessels, 0),
    arrivalsNext7Days: sanitizeNumber(typed.arrivalsNext7Days, 0),
    highConfidenceCargoes: sanitizeNumber(typed.highConfidenceCargoes, 0),
    openAlerts: sanitizeNumber(typed.openAlerts, 0),
    watchlistsWithMatches: sanitizeNumber(typed.watchlistsWithMatches, 0),
    topVessels: Array.isArray(typed.topVessels)
      ? typed.topVessels
          .filter((entry): entry is MorningBriefArchiveRecord["topVessels"][number] => Boolean(entry))
          .map((entry) => ({
            vesselId: sanitizeText(entry.vesselId),
            vesselName: sanitizeText(entry.vesselName),
            destinationPort: sanitizeText(entry.destinationPort),
            eta: sanitizeText(entry.eta),
            commodity: sanitizeText(entry.commodity),
            priorityScore: sanitizeNumber(entry.priorityScore, 0),
          }))
      : [],
    notes: Array.isArray(typed.notes) ? typed.notes.map((value) => sanitizeText(value)).filter(Boolean) : [],
    text: sanitizeText(typed.text),
    csv: sanitizeText(typed.csv),
  };
}

function normalizeStore(raw: unknown): RadarJobsStore {
  if (!raw || typeof raw !== "object") {
    return defaultStore();
  }

  const typed = raw as Partial<RadarJobsStore>;
  return {
    version: 1,
    jobRuns: Array.isArray(typed.jobRuns)
      ? typed.jobRuns.map((entry) => normalizeJobRun(entry)).filter((entry): entry is RadarJobRunRecord => entry !== null).slice(-MAX_JOB_RUNS)
      : [],
    morningBriefArchives: Array.isArray(typed.morningBriefArchives)
      ? typed.morningBriefArchives
          .map((entry) => normalizeArchive(entry))
          .filter((entry): entry is MorningBriefArchiveRecord => entry !== null)
          .slice(-MAX_BRIEF_ARCHIVES)
      : [],
    lastWorkflowSyncRunId: sanitizeNullableText(typed.lastWorkflowSyncRunId),
    lastMorningBriefArchiveId: sanitizeNullableText(typed.lastMorningBriefArchiveId),
  };
}

function writeStore(store: RadarJobsStore) {
  ensureJobsDir();
  fs.writeFileSync(getJobsFile(), JSON.stringify(store, null, 2), "utf-8");
  cache = { loadedAt: Date.now(), store, backend: "file" };
}

function readJobsStoreFresh() {
  ensureJobsDir();
  const jobsFile = getJobsFile();
  if (!fs.existsSync(jobsFile)) {
    const store = defaultStore();
    writeStore(store);
    return store;
  }

  try {
    const raw = fs.readFileSync(jobsFile, "utf-8");
    const parsed = raw ? JSON.parse(raw) : {};
    const store = normalizeStore(parsed);
    cache = { loadedAt: Date.now(), store, backend: "file" };
    return store;
  } catch {
    const store = defaultStore();
    writeStore(store);
    return store;
  }
}

export function getJobsStore(options?: { bypassCache?: boolean }) {
  if (options?.bypassCache) {
    return readJobsStoreFresh();
  }

  const now = Date.now();
  if (cache && now - cache.loadedAt <= CACHE_TTL_MS) {
    return cache.store;
  }

  const store = readJobsStoreFresh();
  cache = { loadedAt: now, store, backend: "file" };
  return store;
}

export function saveJobsStore(store: RadarJobsStore) {
  writeStore({
    ...store,
    jobRuns: store.jobRuns.slice(-MAX_JOB_RUNS),
    morningBriefArchives: store.morningBriefArchives.slice(-MAX_BRIEF_ARCHIVES),
  });
}

export function updateJobsStore(mutator: (store: RadarJobsStore) => RadarJobsStore) {
  const next = mutator(getJobsStore({ bypassCache: true }));
  saveJobsStore(next);
  return next;
}

export function clearJobsHistory(scope: RadarJobsClearScope = "all") {
  if (scope === "all") {
    const store = defaultStore();
    saveJobsStore(store);
    return store;
  }

  if (scope === "runs") {
    const current = getJobsStore({ bypassCache: true });
    const store: RadarJobsStore = {
      ...current,
      jobRuns: [],
      lastWorkflowSyncRunId: null,
    };
    saveJobsStore(store);
    return store;
  }

  const current = getJobsStore({ bypassCache: true });
  const store: RadarJobsStore = {
    ...current,
    morningBriefArchives: [],
    lastMorningBriefArchiveId: null,
  };
  saveJobsStore(store);
  return store;
}

export function createJobsIds() {
  return {
    runId: createId("jobrun"),
    archiveId: createId("brief"),
  };
}

function trimJobsStore(store: RadarJobsStore) {
  return {
    ...store,
    jobRuns: store.jobRuns.slice(-MAX_JOB_RUNS),
    morningBriefArchives: store.morningBriefArchives.slice(-MAX_BRIEF_ARCHIVES),
  };
}

export async function getJobsStoreWithMetaAsync(options?: { bypassCache?: boolean }) {
  if (!options?.bypassCache) {
    const now = Date.now();
    if (cache && now - cache.loadedAt <= CACHE_TTL_MS) {
      return {
        backend: cache.backend,
        store: cache.store,
      };
    }
  }

  const persisted = await readAppState({
    namespace: JOBS_STATE_NAMESPACE,
    normalize: normalizeStore,
  });

  if (persisted.backend === "prisma" && persisted.store) {
    cache = {
      loadedAt: Date.now(),
      store: persisted.store,
      backend: "prisma",
    };
    return {
      backend: "prisma" as const,
      store: persisted.store,
    };
  }

  const fileStore = getJobsStore({ bypassCache: true });
  if (persisted.backend === "prisma") {
    const backend = await writeAppState({
      namespace: JOBS_STATE_NAMESPACE,
      payload: fileStore,
    });
    cache = {
      loadedAt: Date.now(),
      store: fileStore,
      backend,
    };
    return {
      backend,
      store: fileStore,
    };
  }

  cache = {
    loadedAt: Date.now(),
    store: fileStore,
    backend: "file",
  };
  return {
    backend: "file" as const,
    store: fileStore,
  };
}

export async function getJobsStoreAsync(options?: { bypassCache?: boolean }) {
  const result = await getJobsStoreWithMetaAsync(options);
  return result.store;
}

export async function saveJobsStoreAsync(store: RadarJobsStore) {
  const trimmed = trimJobsStore(store);
  writeStore(trimmed);
  const backend = await writeAppState({
    namespace: JOBS_STATE_NAMESPACE,
    payload: trimmed,
  });
  cache = {
    loadedAt: Date.now(),
    store: trimmed,
    backend,
  };
  return trimmed;
}

export async function updateJobsStoreAsync(mutator: (store: RadarJobsStore) => RadarJobsStore) {
  const current = await getJobsStoreAsync({ bypassCache: true });
  const next = mutator(current);
  return saveJobsStoreAsync(next);
}

export async function clearJobsHistoryAsync(scope: RadarJobsClearScope = "all") {
  if (scope === "all") {
    return saveJobsStoreAsync(defaultStore());
  }

  if (scope === "runs") {
    const current = await getJobsStoreAsync({ bypassCache: true });
    return saveJobsStoreAsync({
      ...current,
      jobRuns: [],
      lastWorkflowSyncRunId: null,
    });
  }

  const current = await getJobsStoreAsync({ bypassCache: true });
  return saveJobsStoreAsync({
    ...current,
    morningBriefArchives: [],
    lastMorningBriefArchiveId: null,
  });
}

export async function getJobsPersistenceInfo() {
  const { backend } = await getJobsStoreWithMetaAsync();
  return {
    backend,
    prismaAvailable: isPrismaAvailable,
  };
}
