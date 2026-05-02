import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/formatters";
import { MarketContextDashboardPayload } from "@/lib/market/context";

interface MarketContextViewProps {
  dashboard: MarketContextDashboardPayload;
}

function statusVariant(value: "supportive" | "watch" | "neutral") {
  if (value === "supportive") {
    return "high";
  }
  if (value === "watch") {
    return "medium";
  }
  return "default";
}

export function MarketContextView({ dashboard }: MarketContextViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Market Context</h1>
          <p className="text-sm text-slate-500">
            Public-source market layer for Morocco grain imports, translated into desk-readable signals.
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>{dashboard.sourceLabel}</div>
          <div>Updated {formatRelativeTime(dashboard.generatedAt)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tracked vessels</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.trackedVessels}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Arrivals next 7 / 14 days</CardDescription>
            <CardTitle className="text-3xl text-slate-900">
              {dashboard.summary.arrivalsNext7Days} / {dashboard.summary.arrivalsNext14Days}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High-confidence cargoes</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.highConfidenceCargoes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High-confidence wheat cargoes</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{dashboard.summary.highConfidenceWheatCargoes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High-confidence corn / soybean meal</CardDescription>
            <CardTitle className="text-3xl text-slate-900">
              {dashboard.summary.highConfidenceCornSoymealCargoes}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Public Signals</CardTitle>
          <CardDescription>
            Curated market signals grounded in official public sources and expressed in trader language.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-2">
            {dashboard.currentSignals.map((signal) => (
              <div key={signal.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">{signal.title}</div>
                  <Badge variant={statusVariant(signal.status)}>{signal.status}</Badge>
                </div>
                <div className="mt-2 text-sm text-slate-700">{signal.summary}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {signal.sourceIds.map((sourceId) => {
                    const source = dashboard.publicSources.find((item) => item.id === sourceId);
                    if (!source) {
                      return null;
                    }
                    return (
                      <a
                        key={source.id}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {source.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Origin Flow Mix</CardTitle>
            <CardDescription>Current feed split by exporter-side country and top commodity lane.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origin</TableHead>
                  <TableHead>Tracked</TableHead>
                  <TableHead>High confidence</TableHead>
                  <TableHead>Top commodity</TableHead>
                  <TableHead>Avg conviction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.topOriginFlows.map((row) => (
                  <TableRow key={row.originCountry}>
                    <TableCell className="font-medium text-slate-900">{row.originCountry}</TableCell>
                    <TableCell>{row.vesselCount}</TableCell>
                    <TableCell>{row.highConfidenceCount}</TableCell>
                    <TableCell>{row.topCommodity}</TableCell>
                    <TableCell>
                      Morocco {row.averageMoroccoBoundScore}
                      <br />
                      Agri {row.averageAgriCargoScore}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commodity Pressure</CardTitle>
            <CardDescription>Useful for deciding which commodity lanes deserve trader attention first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commodity</TableHead>
                  <TableHead>Tracked</TableHead>
                  <TableHead>7d / 14d</TableHead>
                  <TableHead>High confidence</TableHead>
                  <TableHead>Top origins</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.commodityPressure.map((row) => (
                  <TableRow key={row.commodity}>
                    <TableCell className="font-medium text-slate-900">{row.commodity}</TableCell>
                    <TableCell>{row.trackedVessels}</TableCell>
                    <TableCell>
                      {row.arrivalsNext7Days} / {row.arrivalsNext14Days}
                    </TableCell>
                    <TableCell>{row.highConfidenceCargoes}</TableCell>
                    <TableCell>{row.topOrigins.join(", ") || "N/A"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Destination Pressure</CardTitle>
          <CardDescription>Import-side port pressure derived from the current radar feed and destination knowledge.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Port</TableHead>
                <TableHead>Incoming / high confidence</TableHead>
                <TableHead>7d / 14d / 30d</TableHead>
                <TableHead>Top commodities</TableHead>
                <TableHead>Source regions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.destinationPressure.map((row) => (
                <TableRow key={row.portId}>
                  <TableCell className="font-medium text-slate-900">{row.portName}</TableCell>
                  <TableCell>
                    {row.incomingVessels} / {row.highConfidenceIncoming}
                  </TableCell>
                  <TableCell>
                    {row.arrivalsNext7Days} / {row.arrivalsNext14Days} / {row.arrivalsNext30Days}
                  </TableCell>
                  <TableCell>{row.topCommodityHypotheses.join(", ") || "N/A"}</TableCell>
                  <TableCell>{row.likelySourceRegions.join(", ") || "N/A"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Official Public Sources</CardTitle>
          <CardDescription>Reference catalog for analysts and traders working without paid market APIs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-2">
            {dashboard.publicSources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 transition-colors hover:bg-slate-100"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">{source.label}</div>
                  <Badge variant="default">{source.publisher}</Badge>
                </div>
                <div className="mt-1 text-sm text-slate-600">{source.usage}</div>
                <div className="mt-2 text-xs text-slate-500">
                  {source.cadence}
                  {source.latestReferenceDate ? ` · reference ${source.latestReferenceDate}` : ""}
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-slate-700">
            {dashboard.notes.length > 0 ? (
              dashboard.notes.map((note) => (
                <li key={note} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {note}
                </li>
              ))
            ) : (
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Public-source context is active. Use it to challenge or confirm the vessel-level signal.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
