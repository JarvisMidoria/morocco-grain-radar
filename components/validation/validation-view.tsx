import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEta, formatRelativeTime } from "@/lib/formatters";
import { ValidationDashboardPayload } from "@/lib/workflow/types";

interface ValidationViewProps {
  dashboard: ValidationDashboardPayload;
}

function commodityLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function phaseLabel(value: string) {
  return value.replaceAll("_", " ");
}

function ratioLabel(value: number | null) {
  return value === null ? "N/A" : `${Math.round(value * 100)}%`;
}

function verdictBadgeVariant(value: "confirmed" | "rejected" | "pending") {
  if (value === "confirmed") {
    return "high";
  }
  if (value === "rejected") {
    return "low";
  }
  return "default";
}

function annotationLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function ValidationView({ dashboard }: ValidationViewProps) {
  const metrics = dashboard.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Validation</h1>
          <p className="text-sm text-slate-500">
            Analyst review log for Morocco-bound and commodity hypotheses.
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>Source {dashboard.source?.label ?? "Unknown source"}</div>
          <div>Updated {formatRelativeTime(dashboard.generatedAt)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total reviewed vessels</CardDescription>
            <CardTitle className="text-3xl">{metrics.totalFeedbackCases}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending review</CardDescription>
            <CardTitle className="text-3xl">{metrics.pendingReviewCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Morocco-bound precision</CardDescription>
            <CardTitle className="text-3xl">{ratioLabel(metrics.moroccoPrecision)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Commodity exact match rate</CardDescription>
            <CardTitle className="text-3xl">{ratioLabel(metrics.commodityExactRate)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Interesting tags</CardDescription>
            <CardTitle className="text-3xl">{metrics.annotatedInterestingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>False positives tagged</CardDescription>
            <CardTitle className="text-3xl">{metrics.annotatedFalsePositiveCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reviewed Cases</CardTitle>
          <CardDescription>Confirmed, rejected, and pending analyst feedback captured from vessel detail pages.</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.cases.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Analyst tags</TableHead>
                  <TableHead>Morocco verdict</TableHead>
                  <TableHead>Commodity call</TableHead>
                  <TableHead>Current live state</TableHead>
                  <TableHead>Reviewed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.cases.map((entry) => (
                  <TableRow key={entry.feedback.id}>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <Link href={`/vessels/${entry.feedback.vesselId}`} className="font-medium text-blue-700 hover:text-blue-800">
                          {entry.feedback.vesselName}
                        </Link>
                        <div className="text-xs text-slate-500">
                          Predicted {commodityLabel(entry.feedback.predictedCommodity)} from {entry.feedback.predictedDeparturePort}
                        </div>
                        <div className="text-xs text-slate-500">
                          Target {entry.feedback.predictedDestinationPort} · ETA {formatEta(entry.feedback.predictedEta)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-2">
                        {entry.feedback.annotations.length > 0 ? (
                          entry.feedback.annotations.map((annotation) => (
                            <Badge key={annotation} variant="default">
                              {annotationLabel(annotation)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">No tags</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-2">
                        <Badge variant={verdictBadgeVariant(entry.feedback.moroccoBoundVerdict)}>
                          {entry.feedback.moroccoBoundVerdict}
                        </Badge>
                        <div className="text-xs text-slate-500">
                          Model score {entry.feedback.predictedMoroccoBoundScore}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-2">
                        <Badge variant={verdictBadgeVariant(entry.feedback.commodityVerdict)}>
                          {entry.feedback.commodityVerdict}
                        </Badge>
                        <div className="text-xs text-slate-500">
                          {commodityLabel(entry.feedback.predictedCommodity)}
                          {entry.feedback.actualCommodity
                            ? ` -> ${commodityLabel(entry.feedback.actualCommodity)}`
                            : " -> unconfirmed"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      {entry.currentLive ? (
                        <div className="space-y-1 text-sm text-slate-700">
                          <div>{phaseLabel(entry.currentLive.detectionPhase)}</div>
                          <div className="text-xs text-slate-500">
                            Morocco {entry.currentLive.moroccoBoundScore} · Agri {entry.currentLive.agriCargoScore}
                          </div>
                          <div className="text-xs text-slate-500">
                            {entry.currentLive.destinationPort} · {formatEta(entry.currentLive.eta)}
                          </div>
                        </div>
                      ) : entry.latestSnapshot ? (
                        <div className="space-y-1 text-sm text-slate-700">
                          <div>{phaseLabel(entry.latestSnapshot.detectionPhase)}</div>
                          <div className="text-xs text-slate-500">
                            Snapshot {entry.latestSnapshot.destinationPort} · {formatEta(entry.latestSnapshot.eta)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500">No live snapshot</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1 text-sm text-slate-700">
                        <div>{formatRelativeTime(entry.feedback.lastReviewedAt)}</div>
                        {entry.feedback.note ? (
                          <div className="max-w-xs text-xs text-slate-500">{entry.feedback.note}</div>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No analyst reviews captured yet. Start from a vessel page to annotate and validate the radar output.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Every analyst change is logged to preserve review history and later model validation.</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.auditTrail.length > 0 ? (
            <div className="space-y-3">
              {dashboard.auditTrail.map((event) => (
                <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-slate-900">{event.vesselName}</div>
                    <div className="text-xs uppercase tracking-[0.08em] text-slate-500">
                      {event.action.replaceAll("_", " ")}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{event.summary}</div>
                  <div className="mt-2 text-xs text-slate-500">{formatRelativeTime(event.createdAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No analyst audit events yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
