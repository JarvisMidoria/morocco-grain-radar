import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CommodityConfidenceBadge } from "@/components/dashboard/commodity-confidence-badge";
import { DetectionPhaseBadge } from "@/components/dashboard/detection-phase-badge";
import { RadarVessel } from "@/lib/types";
import { formatEta } from "@/lib/formatters";

interface VesselTableProps {
  vessels: RadarVessel[];
  showViewLink?: boolean;
}

export function VesselTable({ vessels, showViewLink = true }: VesselTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vessel</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Departure Port</TableHead>
          <TableHead>Since Departure</TableHead>
          <TableHead>Detection Phase</TableHead>
          <TableHead>Commodity</TableHead>
          <TableHead>Morocco-Bound</TableHead>
          <TableHead>Agri Cargo</TableHead>
          <TableHead>ETA</TableHead>
          {showViewLink && <TableHead className="text-right">Details</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {vessels.map((vessel) => (
          <TableRow key={vessel.id}>
            <TableCell className="font-medium text-slate-900">
              <div>{vessel.name}</div>
              <div className="text-xs text-slate-500">IMO {vessel.imo}</div>
              <div className="text-xs text-slate-500">{vessel.observationCount ?? 1} observations</div>
            </TableCell>
            <TableCell>{vessel.vesselType}</TableCell>
            <TableCell>
              <div>{vessel.departurePort}</div>
              <div className="text-xs text-slate-500">{vessel.departureCountry}</div>
            </TableCell>
            <TableCell>
              <div>{vessel.timeSinceDepartureHours.toFixed(1)} h</div>
              {vessel.lastSeenAt && (
                <div className="text-xs text-slate-500">Last seen {formatEta(vessel.lastSeenAt)}</div>
              )}
            </TableCell>
            <TableCell>
              <DetectionPhaseBadge phase={vessel.detectionPhase} />
            </TableCell>
            <TableCell>
              <div className="font-medium text-slate-900">{vessel.mostLikelyCommodity}</div>
              <CommodityConfidenceBadge label={vessel.commodityConfidenceLabel} />
            </TableCell>
            <TableCell className="font-semibold text-slate-900">{vessel.moroccoBoundScore}</TableCell>
            <TableCell className="font-semibold text-slate-900">{vessel.agriCargoScore}</TableCell>
            <TableCell>{formatEta(vessel.eta)}</TableCell>
            {showViewLink && (
              <TableCell className="text-right">
                <Link href={`/vessels/${vessel.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                  View
                </Link>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
