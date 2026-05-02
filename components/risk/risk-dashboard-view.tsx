import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/formatters";
import { PortfolioRiskDashboardPayload } from "@/lib/risk/assessment";

interface RiskDashboardViewProps {
  dashboard: PortfolioRiskDashboardPayload;
}

function severityVariant(value: "info" | "warning" | "critical" | "none") {
  if (value === "critical") {
    return "low";
  }
  if (value === "warning") {
    return "medium";
  }
  return "default";
}

export function RiskDashboardView({ dashboard }: RiskDashboardViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Risk Watch</h1>
          <p className="text-sm text-slate-500">
            Operational and compliance screening signals layered on top of the vessel radar.
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">Updated {formatRelativeTime(dashboard.generatedAt)}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Flagged vessels</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.vesselsWithAnyFlags}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Critical watches</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.criticalVessels}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Warning-level vessels</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.warningVessels}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Info-only vessels</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.infoOnlyVessels}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Top Risk Cases</CardTitle>
            <CardDescription>
              Highest-priority vessels for manual review based on route inconsistency, confidence weakness, data quality, or compliance watch signals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.topRiskVessels.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Risk score</TableHead>
                    <TableHead>Highest severity</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.topRiskVessels.map((snapshot) => (
                    <TableRow key={snapshot.vesselId}>
                      <TableCell className="align-top">
                        <Link href={`/vessels/${snapshot.vesselId}`} className="font-medium text-blue-700 hover:text-blue-800">
                          {snapshot.vesselName}
                        </Link>
                      </TableCell>
                      <TableCell className="align-top">{snapshot.score}</TableCell>
                      <TableCell className="align-top">
                        <Badge variant={severityVariant(snapshot.highestSeverity)}>{snapshot.highestSeverity}</Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-2">
                          {snapshot.flags.map((flag) => (
                            <div key={flag.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={severityVariant(flag.severity)}>{flag.severity}</Badge>
                                <Badge variant="default">{flag.category.replaceAll("_", " ")}</Badge>
                              </div>
                              <div className="mt-1 text-sm text-slate-700">{flag.title}</div>
                              <div className="mt-1 text-xs text-slate-500">{flag.detail}</div>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                No vessels currently exceed the baseline risk heuristics.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Flag Categories</CardTitle>
              <CardDescription>Where the current review load is coming from.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dashboard.byCategory.map((item) => (
                  <div key={item.category} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-sm font-medium text-slate-900">{item.category.replaceAll("_", " ")}</div>
                    <div className="text-sm text-slate-600">{item.count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Compliance References</CardTitle>
              <CardDescription>Official sources to use when a case needs escalation.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dashboard.complianceReferences.map((item) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100"
                  >
                    <div className="font-medium text-slate-900">{item.label}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
