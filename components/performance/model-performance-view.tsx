import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/formatters";
import {
  ModelPerformanceBreakdownRow,
  ModelPerformanceDashboardPayload,
} from "@/lib/workflow/types";

interface ModelPerformanceViewProps {
  dashboard: ModelPerformanceDashboardPayload;
}

function ratioLabel(value: number | null) {
  return value === null ? "N/A" : `${Math.round(value * 100)}%`;
}

function leadTimeLabel(value: number | null) {
  return value === null ? "N/A" : `${value.toFixed(1)} d`;
}

function verdictVariant(value: "confirmed" | "rejected" | "pending") {
  if (value === "confirmed") {
    return "high";
  }
  if (value === "rejected") {
    return "low";
  }
  return "default";
}

function formatDateMaybe(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function commodityLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function BreakdownTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: ModelPerformanceBreakdownRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead>Cases</TableHead>
                <TableHead>TP</TableHead>
                <TableHead>FP</TableHead>
                <TableHead>FN</TableHead>
                <TableHead>Precision</TableHead>
                <TableHead>Recall</TableHead>
                <TableHead>Lead time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 10).map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium text-slate-900">{row.label}</TableCell>
                  <TableCell>{row.totalCases}</TableCell>
                  <TableCell>{row.truePositives}</TableCell>
                  <TableCell>{row.falsePositives}</TableCell>
                  <TableCell>{row.falseNegatives}</TableCell>
                  <TableCell>{ratioLabel(row.precision)}</TableCell>
                  <TableCell>{ratioLabel(row.recall)}</TableCell>
                  <TableCell>{leadTimeLabel(row.averageLeadTimeDays)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
            No reviewed cases available for this segment yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ModelPerformanceView({ dashboard }: ModelPerformanceViewProps) {
  const metrics = dashboard.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Model Performance</h1>
          <p className="text-sm text-slate-500">
            Historical performance derived from analyst-reviewed radar cases and segmented by trade relevance.
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>Source {dashboard.source?.label ?? "Unknown source"}</div>
          <div>Updated {formatRelativeTime(dashboard.generatedAt)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Validated voyages</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{metrics.totalValidatedVoyages}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Morocco precision</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{ratioLabel(metrics.precision)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Morocco recall</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{ratioLabel(metrics.recall)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average lead time</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{leadTimeLabel(metrics.averageLeadTimeDays)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>False positives</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{metrics.falsePositives}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>False negatives</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{metrics.falseNegatives}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Commodity exact rate</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{ratioLabel(metrics.commodityExactRate)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Positive score threshold</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.thresholds.moroccoBoundPositiveScore}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scoring Versions</CardTitle>
          <CardDescription>New analyst-reviewed cases are assigned to the active scoring version at review time.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-2">
            {dashboard.scoringVersions.map((version) => (
              <div key={version.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">{version.label}</div>
                  {version.isActive ? <Badge variant="high">Active</Badge> : <Badge variant="default">Historical</Badge>}
                </div>
                <div className="mt-1 text-sm text-slate-600">{version.description ?? "No description"}</div>
                <div className="mt-2 text-xs text-slate-500">
                  {version.slug} · created {formatDateMaybe(version.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownTable
          title="By Origin Country"
          description="How Morocco-bound performance changes by export origin."
          rows={dashboard.byOriginCountry}
        />
        <BreakdownTable
          title="By Destination Port"
          description="Historical accuracy split by inferred Morocco destination port."
          rows={dashboard.byDestinationPort}
        />
        <BreakdownTable
          title="By Commodity"
          description="Reviewed performance by predicted or confirmed cargo family."
          rows={dashboard.byCommodity}
        />
        <BreakdownTable
          title="By Corridor"
          description="Operational corridor segments combining origin, route context, and destination."
          rows={dashboard.byCorridor}
        />
        <BreakdownTable
          title="By Scoring Version"
          description="Before/after comparison becomes meaningful as multiple scoring versions accumulate."
          rows={dashboard.byScoringVersion}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Validated Cases</CardTitle>
          <CardDescription>Latest analyst-reviewed voyages feeding the historical performance dataset.</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.recentCases.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Corridor</TableHead>
                  <TableHead>Morocco verdict</TableHead>
                  <TableHead>Commodity</TableHead>
                  <TableHead>Lead time</TableHead>
                  <TableHead>Reviewed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recentCases.map((voyage) => {
                  const version = dashboard.scoringVersions.find((entry) => entry.id === voyage.scoringVersionId);
                  return (
                    <TableRow key={voyage.id}>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <Link href={`/vessels/${voyage.vesselId}`} className="font-medium text-blue-700 hover:text-blue-800">
                            {voyage.vesselName}
                          </Link>
                          <div className="text-xs text-slate-500">
                            {voyage.departurePort}
                            {" -> "}
                            {voyage.destinationPort}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-700">
                        {version?.label ?? voyage.scoringVersionId}
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-700">{voyage.corridor}</TableCell>
                      <TableCell className="align-top">
                        <Badge variant={verdictVariant(voyage.moroccoBoundVerdict)}>
                          {voyage.moroccoBoundVerdict}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-700">
                        {commodityLabel(voyage.predictedCommodity)}
                        {voyage.actualCommodity ? ` -> ${commodityLabel(voyage.actualCommodity)}` : ""}
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-700">
                        {leadTimeLabel(voyage.leadTimeDays)}
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-700">
                        {formatRelativeTime(voyage.reviewRecordedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No validated cases yet.
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
            {dashboard.notes.map((note) => (
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
