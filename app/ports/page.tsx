import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEta } from "@/lib/formatters";
import { getPortOverviews, getRadarVessels } from "@/lib/radar/service";

export const dynamic = "force-dynamic";

function relevanceVariant(value: "high" | "medium" | "low" | null) {
  if (value === "high") {
    return "high";
  }
  if (value === "medium") {
    return "medium";
  }
  return "default";
}

export default async function PortsPage() {
  const vessels = await getRadarVessels();
  const portOverviews = getPortOverviews(vessels);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Ports</h1>
        <p className="text-sm text-slate-500">Port-level early-detection intelligence for Morocco-bound agri cargo hypotheses.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Morocco Port Intelligence</CardTitle>
          <CardDescription>
            Destination-port desk view with arrival horizons, conviction, and import-side relevance from the knowledge base.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Port</TableHead>
                <TableHead>Knowledge fit</TableHead>
                <TableHead>Incoming / high confidence</TableHead>
                <TableHead>7d / 14d / 30d</TableHead>
                <TableHead>Top Origin Ports</TableHead>
                <TableHead>Top Commodity Hypotheses</TableHead>
                <TableHead>Avg conviction</TableHead>
                <TableHead>Avg Days to Arrival</TableHead>
                <TableHead>Next Arrival</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portOverviews.map((overview) => (
                <TableRow key={overview.portId}>
                  <TableCell className="align-top">
                    <div className="font-medium text-slate-900">{overview.portName}</div>
                    <div className="mt-1 text-xs text-slate-500">{overview.likelySourceRegions.join(", ") || "No source-region hint"}</div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={relevanceVariant(overview.destinationGrainRelevance)}>
                        Grain {overview.destinationGrainRelevance ?? "n/a"}
                      </Badge>
                      <Badge variant={relevanceVariant(overview.destinationFeedRelevance)}>
                        Feed {overview.destinationFeedRelevance ?? "n/a"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="font-medium text-slate-900">{overview.incomingVessels}</div>
                    <div className="text-xs text-slate-500">{overview.highConfidenceIncoming} high confidence</div>
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-700">
                    {overview.arrivalsNext7Days} / {overview.arrivalsNext14Days} / {overview.arrivalsNext30Days}
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-700">{overview.topOriginPorts.join(", ") || "N/A"}</TableCell>
                  <TableCell className="align-top text-sm text-slate-700">{overview.topCommodityHypotheses.join(", ") || "N/A"}</TableCell>
                  <TableCell className="align-top text-sm text-slate-700">
                    Morocco {overview.averageMoroccoBoundScore?.toFixed(1) ?? "N/A"}
                    <br />
                    Agri {overview.averageAgriCargoScore?.toFixed(1) ?? "N/A"}
                  </TableCell>
                  <TableCell>
                    {overview.averageEstimatedDaysToArrival !== null
                      ? `${overview.averageEstimatedDaysToArrival.toFixed(1)} d`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="align-top">
                    <div>{overview.nextArrivalEta ? formatEta(overview.nextArrivalEta) : "N/A"}</div>
                    <div className="text-xs text-slate-500">{overview.earlyDetectedLikely} early detected likely</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
