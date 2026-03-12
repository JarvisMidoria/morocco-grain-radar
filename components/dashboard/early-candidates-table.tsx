import Link from "next/link";
import { CommodityConfidenceBadge } from "@/components/dashboard/commodity-confidence-badge";
import { DetectionPhaseBadge } from "@/components/dashboard/detection-phase-badge";
import { FavoriteToggle } from "@/components/dashboard/favorite-toggle";
import { ScoreBadge } from "@/components/dashboard/score-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEta } from "@/lib/formatters";
import { RadarVessel } from "@/lib/types";

interface EarlyCandidatesTableProps {
  vessels: RadarVessel[];
}

function formatCommodity(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
          <TableHead className="hidden md:table-cell">Detection Phase</TableHead>
          <TableHead className="hidden md:table-cell">Morocco-Bound</TableHead>
          <TableHead className="hidden md:table-cell">Agri Cargo</TableHead>
          <TableHead className="hidden md:table-cell">Most Likely Commodity</TableHead>
          <TableHead className="hidden md:table-cell">Commodity Confidence</TableHead>
          <TableHead className="hidden text-right md:table-cell">Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vessels.map((vessel) => (
          <TableRow key={vessel.id}>
            <TableCell className="font-medium text-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div>{vessel.name}</div>
                  <div className="text-xs text-slate-500">IMO {vessel.imo || "N/A"}</div>
                </div>
                <FavoriteToggle vesselId={vessel.id} initialFavorite={vessel.isFavorite} />
              </div>
              <div className="mt-2 space-y-1.5 md:hidden">
                <div className="flex flex-wrap gap-1.5">
                  <DetectionPhaseBadge phase={vessel.detectionPhase} />
                  <CommodityConfidenceBadge label={vessel.commodityConfidenceLabel} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                    {formatCommodity(vessel.mostLikelyCommodity)}
                  </Badge>
                  <ScoreBadge score={vessel.moroccoBoundScore} label="Morocco" />
                  <ScoreBadge score={vessel.agriCargoScore} label="Agri" />
                </div>
                <Link
                  href={`/vessels/${vessel.id}`}
                  className="inline-flex text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  View
                </Link>
              </div>
            </TableCell>
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
            <TableCell className="hidden md:table-cell">
              <DetectionPhaseBadge phase={vessel.detectionPhase} />
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <ScoreBadge score={vessel.moroccoBoundScore} />
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <ScoreBadge score={vessel.agriCargoScore} />
            </TableCell>
            <TableCell className="hidden font-semibold text-slate-900 md:table-cell">
              {formatCommodity(vessel.mostLikelyCommodity)}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <CommodityConfidenceBadge label={vessel.commodityConfidenceLabel} />
            </TableCell>
            <TableCell className="hidden text-right md:table-cell">
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
