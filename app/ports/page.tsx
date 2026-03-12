import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEta } from "@/lib/formatters";
import { getPortOverviews, getRadarVessels } from "@/lib/radar/service";

export const dynamic = "force-dynamic";

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
            Early-detected candidates, top origin ports, commodity hypotheses, and arrival horizon by destination port.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Port</TableHead>
                <TableHead>Incoming Vessels</TableHead>
                <TableHead>Early Detected Likely</TableHead>
                <TableHead>Top Origin Ports</TableHead>
                <TableHead>Top Commodity Hypotheses</TableHead>
                <TableHead>Avg Days to Arrival</TableHead>
                <TableHead>Next Arrival</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portOverviews.map((overview) => (
                <TableRow key={overview.portId}>
                  <TableCell className="font-medium text-slate-900">{overview.portName}</TableCell>
                  <TableCell>{overview.incomingVessels}</TableCell>
                  <TableCell>{overview.earlyDetectedLikely}</TableCell>
                  <TableCell>{overview.topOriginPorts.join(", ") || "N/A"}</TableCell>
                  <TableCell>{overview.topCommodityHypotheses.join(", ") || "N/A"}</TableCell>
                  <TableCell>
                    {overview.averageEstimatedDaysToArrival !== null
                      ? `${overview.averageEstimatedDaysToArrival.toFixed(1)} d`
                      : "N/A"}
                  </TableCell>
                  <TableCell>{overview.nextArrivalEta ? formatEta(overview.nextArrivalEta) : "N/A"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
