import Link from "next/link";
import { CommodityConfidenceBadge } from "@/components/dashboard/commodity-confidence-badge";
import { DetectionPhaseBadge } from "@/components/dashboard/detection-phase-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEta } from "@/lib/formatters";
import { RadarVessel } from "@/lib/types";

interface EarlyCandidatesTableProps {
  vessels: RadarVessel[];
}

export function EarlyCandidatesTable({ vessels }: EarlyCandidatesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vessel</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Departure Port</TableHead>
          <TableHead>Departure Time</TableHead>
          <TableHead>Since Departure</TableHead>
          <TableHead>Maritime Zone</TableHead>
          <TableHead>Suspected Destination Region</TableHead>
          <TableHead>Days to Morocco</TableHead>
          <TableHead>Detection Phase</TableHead>
          <TableHead>Morocco-Bound</TableHead>
          <TableHead>Agri Cargo</TableHead>
          <TableHead>Most Likely Commodity</TableHead>
          <TableHead>Commodity Confidence</TableHead>
          <TableHead className="text-right">Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vessels.map((vessel) => (
          <TableRow key={vessel.id}>
            <TableCell className="font-medium text-slate-900">{vessel.name}</TableCell>
            <TableCell>{vessel.vesselType}</TableCell>
            <TableCell>
              <div>{vessel.departurePort}</div>
              <div className="text-xs text-slate-500">{vessel.departureCountry}</div>
            </TableCell>
            <TableCell>
              <div>{formatEta(vessel.departureDetectedAt)}</div>
              {vessel.firstSeenAt && (
                <div className="text-xs text-slate-500">First seen {formatEta(vessel.firstSeenAt)}</div>
              )}
            </TableCell>
            <TableCell>
              <div>{vessel.timeSinceDepartureHours.toFixed(1)} h</div>
              <div className="text-xs text-slate-500">{vessel.observationCount ?? 1} obs</div>
            </TableCell>
            <TableCell>{vessel.currentMaritimeZone}</TableCell>
            <TableCell>{vessel.suspectedDestinationRegion}</TableCell>
            <TableCell>{vessel.estimatedDaysToMorocco.toFixed(1)} d</TableCell>
            <TableCell>
              <DetectionPhaseBadge phase={vessel.detectionPhase} />
            </TableCell>
            <TableCell className="font-semibold text-slate-900">{vessel.moroccoBoundScore}</TableCell>
            <TableCell className="font-semibold text-slate-900">{vessel.agriCargoScore}</TableCell>
            <TableCell className="font-semibold text-slate-900">{vessel.mostLikelyCommodity}</TableCell>
            <TableCell>
              <CommodityConfidenceBadge label={vessel.commodityConfidenceLabel} />
            </TableCell>
            <TableCell className="text-right">
              <Link href={`/vessels/${vessel.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                View
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
