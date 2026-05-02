"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEta, formatRelativeTime } from "@/lib/formatters";
import { RadarJobsClearScope, RadarJobsDashboardPayload, RadarJobRunRecord } from "@/lib/jobs/types";

interface JobsDashboardViewProps {
  initialDashboard: RadarJobsDashboardPayload;
}

function statusVariant(status: RadarJobRunRecord["status"]) {
  return status === "success" ? "high" : "low";
}

function typeLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function JobsDashboardView({ initialDashboard }: JobsDashboardViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"workflow" | "brief" | RadarJobsClearScope | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function triggerJob(kind: "workflow" | "brief") {
    setBusy(kind);
    setMessage(null);

    try {
      const endpoint = kind === "workflow" ? "/api/jobs/workflow-sync" : "/api/jobs/morning-brief";
      const response = await fetch(endpoint, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Job trigger failed.");
      }

      setMessage(kind === "workflow" ? "Workflow sync completed." : "Morning brief archived.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Job trigger failed.");
    } finally {
      setBusy(null);
    }
  }

  async function clearHistory(scope: RadarJobsClearScope) {
    const label =
      scope === "runs" ? "job runs" : scope === "archives" ? "morning brief archives" : "all local job history";
    if (!window.confirm(`Clear ${label}?`)) {
      return;
    }

    setBusy(scope);
    setMessage(null);

    try {
      const response = await fetch(`/api/jobs?scope=${scope}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Jobs clear failed.");
      }

      setMessage(
        scope === "all"
          ? "All local job history cleared."
          : scope === "runs"
            ? "Job runs cleared."
            : "Morning brief archives cleared.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Jobs clear failed.");
    } finally {
      setBusy(null);
    }
  }

  const latestArchive = initialDashboard.latestMorningBriefArchive;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Jobs</h1>
          <p className="text-sm text-slate-500">
            Manual and cron-friendly workflow sync plus archived morning briefs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => triggerJob("workflow")} disabled={busy !== null}>
            {busy === "workflow" ? "Running sync..." : "Run workflow sync"}
          </Button>
          <Button type="button" onClick={() => triggerJob("brief")} disabled={busy !== null}>
            {busy === "brief" ? "Archiving..." : "Archive morning brief"}
          </Button>
          <Button type="button" variant="outline" onClick={() => clearHistory("archives")} disabled={busy !== null}>
            {busy === "archives" ? "Clearing..." : "Clear archives"}
          </Button>
          <Button type="button" variant="outline" onClick={() => clearHistory("all")} disabled={busy !== null}>
            {busy === "all" ? "Clearing..." : "Reset all"}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total runs</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{initialDashboard.summary.totalRuns}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Successful runs</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{initialDashboard.summary.successfulRuns}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed runs</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{initialDashboard.summary.failedRuns}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Archived briefs</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{initialDashboard.summary.archivedBriefs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last workflow sync</CardDescription>
            <CardTitle className="text-sm text-slate-900">
              {initialDashboard.summary.lastWorkflowSyncAt
                ? formatRelativeTime(initialDashboard.summary.lastWorkflowSyncAt)
                : "Never"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last brief archive</CardDescription>
            <CardTitle className="text-sm text-slate-900">
              {initialDashboard.summary.lastMorningBriefAt
                ? formatRelativeTime(initialDashboard.summary.lastMorningBriefAt)
                : "Never"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cron Surface</CardTitle>
          <CardDescription>
            Endpoints ready for external schedulers. If <code>RADAR_JOB_TOKEN</code> is set, pass it as
            <code> x-radar-job-token</code> or <code>?token=...</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="font-medium text-slate-900">POST /api/jobs/workflow-sync</div>
            <div>Refreshes workflow telemetry and stores an execution record.</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="font-medium text-slate-900">POST /api/jobs/morning-brief</div>
            <div>Archives the current morning brief snapshot for downstream distribution.</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="font-medium text-slate-900">GET /api/jobs/morning-brief?format=text|csv</div>
            <div>Downloads the latest archived brief in text or CSV format.</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest Morning Brief Archive</CardTitle>
          <CardDescription>
            Persisted snapshot that can be fetched by cron or distributed outside the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {latestArchive ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Tracked</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">{latestArchive.trackedVessels}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Arrivals 7d</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">{latestArchive.arrivalsNext7Days}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">High confidence</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">{latestArchive.highConfidenceCargoes}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Open alerts</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">{latestArchive.openAlerts}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>{latestArchive.sourceLabel ?? "Unknown source"}</span>
                <span>·</span>
                <span>{formatEta(latestArchive.generatedAt)}</span>
                <span>·</span>
                <a href="/api/jobs/morning-brief?format=text" className="text-blue-700 hover:text-blue-800">
                  Download text
                </a>
                <span>·</span>
                <a href="/api/jobs/morning-brief?format=csv" className="text-blue-700 hover:text-blue-800">
                  Download CSV
                </a>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Top vessels</div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {latestArchive.topVessels.slice(0, 8).map((entry) => (
                      <li key={entry.vesselId} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        {entry.vesselName} · {entry.commodity} · {entry.destinationPort} · P{entry.priorityScore}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Notes</div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {latestArchive.notes.length > 0 ? (
                      latestArchive.notes.map((note) => (
                        <li key={note} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          {note}
                        </li>
                      ))
                    ) : (
                      <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">No notes archived.</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-950 p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-slate-400">Archived text</div>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-100">
                  {latestArchive.text}
                </pre>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No morning brief archive exists yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Job Runs</CardTitle>
          <CardDescription>
            Sync and archive execution history with basic operational telemetry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialDashboard.recentRuns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Tracked / alerts</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialDashboard.recentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="align-top">{typeLabel(run.jobType)}</TableCell>
                    <TableCell className="align-top">
                      <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                    </TableCell>
                    <TableCell className="align-top">{typeLabel(run.trigger)}</TableCell>
                    <TableCell className="align-top">{formatEta(run.finishedAt)}</TableCell>
                    <TableCell className="align-top">{run.durationMs} ms</TableCell>
                    <TableCell className="align-top">
                      {run.trackedVessels} / {run.openAlerts}
                    </TableCell>
                    <TableCell className="align-top text-sm text-slate-700">
                      {run.message ?? run.error ?? "No message"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No job run is recorded yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-slate-700">
            {initialDashboard.notes.map((note) => (
              <li key={note} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                {note}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
