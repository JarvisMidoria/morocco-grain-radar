import Link from "next/link";
import { FavoriteToggle } from "@/components/dashboard/favorite-toggle";
import { ActionabilityBadge } from "@/components/opportunities/actionability-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CommodityConfidenceBadge } from "@/components/dashboard/commodity-confidence-badge";
import { DetectionPhaseBadge } from "@/components/dashboard/detection-phase-badge";
import { ScoreBadge } from "@/components/dashboard/score-badge";
import { RadarVessel } from "@/lib/types";
import { formatEta } from "@/lib/formatters";
import { buildTraderActionabilitySnapshot } from "@/lib/trader/actionability";

interface VesselTableProps {
  vessels: RadarVessel[];
  showViewLink?: boolean;
}

function formatCommodity(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
          <TableHead className="hidden md:table-cell">Detection Phase</TableHead>
          <TableHead className="hidden md:table-cell">Commodity</TableHead>
          <TableHead className="hidden md:table-cell">Morocco-Bound</TableHead>
          <TableHead className="hidden md:table-cell">Agri Cargo</TableHead>
          <TableHead className="hidden xl:table-cell">Actionability</TableHead>
          <TableHead>ETA</TableHead>
          {showViewLink && <TableHead className="hidden text-right md:table-cell">Details</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {vessels.map((vessel) => {
          const actionability = buildTraderActionabilitySnapshot(vessel);

          return (
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
                    <ActionabilityBadge band={actionability.band} score={actionability.score} />
                  </div>
                  {showViewLink && (
                    <Link
                      href={`/vessels/${vessel.id}`}
                      className="inline-flex text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      View
                    </Link>
                  )}
                </div>
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
              <TableCell className="hidden md:table-cell">
                <DetectionPhaseBadge phase={vessel.detectionPhase} />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="font-medium text-slate-900">{formatCommodity(vessel.mostLikelyCommodity)}</div>
                <CommodityConfidenceBadge label={vessel.commodityConfidenceLabel} />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <ScoreBadge score={vessel.moroccoBoundScore} />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <ScoreBadge score={vessel.agriCargoScore} />
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                <div className="space-y-1">
                  <ActionabilityBadge band={actionability.band} score={actionability.score} />
                  <div className="text-xs text-slate-500">{actionability.nextAction}</div>
                </div>
              </TableCell>
              <TableCell>{formatEta(vessel.eta)}</TableCell>
              {showViewLink && (
                <TableCell className="hidden text-right md:table-cell">
                  <Link href={`/vessels/${vessel.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                    View
                  </Link>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
