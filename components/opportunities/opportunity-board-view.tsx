import Link from "next/link";
import { ActionabilityBadge } from "@/components/opportunities/actionability-badge";
import { DetectionPhaseBadge } from "@/components/dashboard/detection-phase-badge";
import { FavoriteToggle } from "@/components/dashboard/favorite-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEta, formatRelativeTime } from "@/lib/formatters";
import { TraderOpportunityBoardPayload } from "@/lib/trader/opportunities";

interface OpportunityBoardViewProps {
  board: TraderOpportunityBoardPayload;
}

function commodityLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function riskVariant(value: "none" | "info" | "warning" | "critical") {
  if (value === "critical") {
    return "low";
  }
  if (value === "warning") {
    return "medium";
  }
  if (value === "info") {
    return "high";
  }
  return "default";
}

function queueVariant(value: "low" | "medium" | "high" | null) {
  if (value === "high") {
    return "low";
  }
  if (value === "medium") {
    return "medium";
  }
  if (value === "low") {
    return "high";
  }
  return "default";
}

function readinessVariant(value: "low" | "medium" | "high" | null) {
  if (value === "high") {
    return "high";
  }
  if (value === "medium") {
    return "medium";
  }
  if (value === "low") {
    return "default";
  }
  return "default";
}

export function OpportunityBoardView({ board }: OpportunityBoardViewProps) {
  const prioritizedLeadOpportunities = board.opportunities
    .filter((entry) => entry.band === "immediate" || entry.band === "high")
    .slice(0, 4);
  const leadOpportunities =
    prioritizedLeadOpportunities.length > 0
      ? prioritizedLeadOpportunities
      : board.opportunities.slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Opportunities</h1>
          <p className="text-sm text-slate-500">
            Desk-first shortlist combining conviction, timing, execution, and risk into one actionability layer.
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>{board.sourceLabel}</div>
          <div>Updated {formatRelativeTime(board.generatedAt)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Immediate desk actions</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{board.summary.immediateDeskActions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High-priority cases</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{board.summary.highPriorityCases}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Developing cases</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{board.summary.developingCases}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monitoring only</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{board.summary.monitorCases}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average actionability</CardDescription>
            <CardTitle className="text-3xl text-slate-900">
              {board.summary.averageActionabilityScore !== null ? board.summary.averageActionabilityScore : "N/A"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open alerts / 24h changes</CardDescription>
            <CardTitle className="text-3xl text-slate-900">
              {board.summary.openAlerts} / {board.summary.recentChangesLast24Hours}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Immediate Desk Priorities</CardTitle>
          <CardDescription>
            Cases worth a commercial or execution follow-up now, not after another exploratory pass.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leadOpportunities.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {leadOpportunities.map((entry) => (
                <div key={entry.vesselId} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/vessels/${entry.vesselId}`} className="text-base font-semibold text-blue-700 hover:text-blue-800">
                        {entry.vesselName}
                      </Link>
                      <p className="text-sm text-slate-500">
                        {entry.destinationPort} · {commodityLabel(entry.mostLikelyCommodity)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <FavoriteToggle vesselId={entry.vesselId} initialFavorite={entry.isFavorite} />
                      <ActionabilityBadge band={entry.band} score={entry.score} />
                      <DetectionPhaseBadge phase={entry.detectionPhase} />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p>
                      <span className="font-medium text-slate-900">ETA:</span> {formatEta(entry.eta)}
                    </p>
                    <p>
                      <span className="font-medium text-slate-900">Days to Morocco:</span> {entry.estimatedDaysToMorocco.toFixed(1)}
                    </p>
                    <p>
                      <span className="font-medium text-slate-900">Execution:</span> {entry.executionPriorityScore}
                    </p>
                    <p>
                      <span className="font-medium text-slate-900">Risk:</span> {entry.riskScore}
                    </p>
                  </div>

                  <p className="mt-3 text-sm font-medium text-slate-900">Next action</p>
                  <p className="mt-1 text-sm text-slate-600">{entry.nextAction}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.arrivalStage ? <Badge variant={queueVariant(entry.queuePressure)}>{entry.arrivalStage.replaceAll("_", " ")}</Badge> : null}
                    {entry.queuePressure ? <Badge variant={queueVariant(entry.queuePressure)}>queue {entry.queuePressure}</Badge> : null}
                    {entry.dischargeReadiness ? (
                      <Badge variant={readinessVariant(entry.dischargeReadiness)}>ready {entry.dischargeReadiness}</Badge>
                    ) : null}
                    <Badge variant={riskVariant(entry.riskSeverity)}>risk {entry.riskSeverity}</Badge>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Conviction</p>
                      <ul className="mt-1 space-y-1 text-sm text-slate-600">
                        {entry.convictionReasons.map((reason) => (
                          <li key={reason} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Blockers</p>
                      <ul className="mt-1 space-y-1 text-sm text-slate-600">
                        {entry.blockers.map((reason) => (
                          <li key={reason} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No vessel currently deserves desk escalation under the current heuristics.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Opportunities</CardTitle>
          <CardDescription>
            Ranked shortlist for the trading desk, ordered by actionability rather than raw detection score only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {board.opportunities.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[56px]">Fav</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Actionability</TableHead>
                  <TableHead>Commodity / destination</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Execution</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Next action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.opportunities.map((entry) => (
                  <TableRow key={entry.vesselId}>
                    <TableCell className="align-top">
                      <FavoriteToggle vesselId={entry.vesselId} initialFavorite={entry.isFavorite} />
                    </TableCell>
                    <TableCell className="align-top">
                      <Link href={`/vessels/${entry.vesselId}`} className="font-medium text-blue-700 hover:text-blue-800">
                        {entry.vesselName}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">{entry.detectionPhase.replaceAll("_", " ")}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <ActionabilityBadge band={entry.band} score={entry.score} />
                    </TableCell>
                    <TableCell className="align-top text-sm text-slate-700">
                      {commodityLabel(entry.mostLikelyCommodity)}
                      <br />
                      <span className="text-xs text-slate-500">{entry.destinationPort}</span>
                    </TableCell>
                    <TableCell className="align-top text-sm text-slate-700">
                      {formatEta(entry.eta)}
                      <div className="mt-1 text-xs text-slate-500">{entry.estimatedDaysToMorocco.toFixed(1)} d to Morocco</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-2">
                        {entry.arrivalStage ? (
                          <Badge variant={queueVariant(entry.queuePressure)}>{entry.arrivalStage.replaceAll("_", " ")}</Badge>
                        ) : (
                          <Badge>en route</Badge>
                        )}
                        {entry.queuePressure ? <Badge variant={queueVariant(entry.queuePressure)}>queue {entry.queuePressure}</Badge> : null}
                        {entry.dischargeReadiness ? (
                          <Badge variant={readinessVariant(entry.dischargeReadiness)}>ready {entry.dischargeReadiness}</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">execution {entry.executionPriorityScore}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={riskVariant(entry.riskSeverity)}>risk {entry.riskSeverity}</Badge>
                      <div className="mt-1 text-xs text-slate-500">score {entry.riskScore}</div>
                    </TableCell>
                    <TableCell className="align-top text-sm text-slate-700">{entry.nextAction}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No opportunities are currently ranked for the desk.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What Changed In The Last 24 Hours</CardTitle>
          <CardDescription>
            Latest phase, score, ETA, and destination events that can change the commercial reading.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {board.recentChanges.length > 0 ? (
            <div className="space-y-3">
              {board.recentChanges.map((event) => (
                <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-slate-900">
                      {event.vesselName} · {event.title}
                    </div>
                    <div className="text-xs uppercase tracking-[0.08em] text-slate-500">{event.type.replaceAll("_", " ")}</div>
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{event.summary}</div>
                  <div className="mt-2 text-xs text-slate-500">{formatRelativeTime(event.createdAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No workflow change has been recorded in the last 24 hours.
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
            {board.notes.map((note) => (
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
