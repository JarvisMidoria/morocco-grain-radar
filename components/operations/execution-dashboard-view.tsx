import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEta, formatRelativeTime } from "@/lib/formatters";
import { MoroccoExecutionDashboardPayload } from "@/lib/operations/morocco-execution";

interface ExecutionDashboardViewProps {
  dashboard: MoroccoExecutionDashboardPayload;
}

function stageVariant(value: "monitor" | "arrival_watch" | "prepare_berth" | "immediate_attention") {
  if (value === "immediate_attention") {
    return "low";
  }
  if (value === "prepare_berth") {
    return "medium";
  }
  if (value === "arrival_watch") {
    return "high";
  }
  return "default";
}

function pressureVariant(value: "low" | "medium" | "high") {
  if (value === "high") {
    return "low";
  }
  if (value === "medium") {
    return "medium";
  }
  return "high";
}

function readinessVariant(value: "low" | "medium" | "high") {
  if (value === "high") {
    return "high";
  }
  if (value === "medium") {
    return "medium";
  }
  return "default";
}

function commodityLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ExecutionDashboardView({ dashboard }: ExecutionDashboardViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Operations</h1>
          <p className="text-sm text-slate-500">
            Morocco execution layer for arrival sequencing, berth preparation, and port pressure.
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>{dashboard.sourceLabel}</div>
          <div>Updated {formatRelativeTime(dashboard.generatedAt)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tracked Morocco arrivals</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.trackedVessels}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Immediate attention</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.immediateAttentionVessels}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Prepare berth</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.berthPreparationVessels}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ports under high pressure</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.portsUnderHighPressure}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average operational ETA window</CardDescription>
            <CardTitle className="text-3xl text-slate-900">
              {dashboard.summary.averageEtaWindowHours !== null
                ? `${dashboard.summary.averageEtaWindowHours.toFixed(1)} h`
                : "N/A"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Near-Term Arrival Queue</CardTitle>
          <CardDescription>
            AIS ETA translated into a wider operational arrival window, with readiness and port pressure layered in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.nearTermArrivals.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>AIS ETA</TableHead>
                  <TableHead>Operational window</TableHead>
                  <TableHead>Readiness / queue</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.nearTermArrivals.map((entry) => (
                  <TableRow key={entry.vesselId}>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <Link href={`/vessels/${entry.vesselId}`} className="font-medium text-blue-700 hover:text-blue-800">
                          {entry.vesselName}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {commodityLabel(entry.mostLikelyCommodity)} · {entry.vesselVoyageState.replaceAll("_", " ")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={stageVariant(entry.arrivalStage)}>
                        {entry.arrivalStage.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium text-slate-900">{entry.destinationPort}</div>
                      <div className="text-xs text-slate-500">{entry.estimatedDaysToMorocco.toFixed(1)} d to Morocco</div>
                    </TableCell>
                    <TableCell className="align-top text-sm text-slate-700">{formatEta(entry.eta)}</TableCell>
                    <TableCell className="align-top text-sm text-slate-700">
                      {formatEta(entry.operationalEtaWindow.earliestEta)}
                      <br />
                      {formatEta(entry.operationalEtaWindow.latestEta)}
                      <div className="mt-1 text-xs text-slate-500">
                        {entry.operationalEtaWindow.rangeHours}h · {entry.operationalEtaWindow.confidenceBand}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={readinessVariant(entry.dischargeReadiness)}>
                          ready {entry.dischargeReadiness}
                        </Badge>
                        <Badge variant={pressureVariant(entry.queuePressure)}>
                          queue {entry.queuePressure}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Morocco {entry.moroccoBoundScore} · Agri {entry.agriCargoScore}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium text-slate-900">{entry.executionPriorityScore}</div>
                      <div className="mt-1 text-xs text-slate-500">{entry.notes[0] ?? "No extra note"}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No Morocco-bound arrivals are currently active in the feed.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Port Pressure</CardTitle>
          <CardDescription>
            Port-centric view to help decide where discharge sequencing or congestion risk deserves attention.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.portPressure.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Port</TableHead>
                  <TableHead>Incoming / high confidence</TableHead>
                  <TableHead>7d / 14d / 30d</TableHead>
                  <TableHead>Pressure</TableHead>
                  <TableHead>Avg conviction</TableHead>
                  <TableHead>Next operational ETA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.portPressure.map((entry) => (
                  <TableRow key={entry.portId}>
                    <TableCell className="align-top">
                      <div className="font-medium text-slate-900">{entry.portName}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {entry.grainRelevance ? <Badge variant={readinessVariant(entry.grainRelevance)}>grain {entry.grainRelevance}</Badge> : null}
                        {entry.feedRelevance ? <Badge variant={readinessVariant(entry.feedRelevance)}>feed {entry.feedRelevance}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      {entry.incomingVessels} / {entry.highConfidenceIncoming}
                    </TableCell>
                    <TableCell className="align-top">
                      {entry.arrivalsNext7Days} / {entry.arrivalsNext14Days} / {entry.arrivalsNext30Days}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={pressureVariant(entry.queuePressure)}>{entry.queuePressure}</Badge>
                      <div className="mt-1 text-xs text-slate-500">score {entry.queuePressureScore}</div>
                    </TableCell>
                    <TableCell className="align-top text-sm text-slate-700">
                      Morocco {entry.averageMoroccoBoundScore}
                      <br />
                      Agri {entry.averageAgriCargoScore}
                    </TableCell>
                    <TableCell className="align-top text-sm text-slate-700">
                      {entry.nextOperationalEta ? formatEta(entry.nextOperationalEta) : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No port pressure is currently visible.
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
