import { CommodityConfidenceBadge } from "@/components/dashboard/commodity-confidence-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WatchlistFallbackCandidate } from "@/lib/types";

interface WatchlistFallbackTableProps {
  candidates: WatchlistFallbackCandidate[];
}

function formatVoyageHypothesis(value: string) {
  return value.replaceAll("_", " ");
}

export function WatchlistFallbackTable({ candidates }: WatchlistFallbackTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vessel</TableHead>
          <TableHead>Departure Port</TableHead>
          <TableHead>Current Corridor</TableHead>
          <TableHead>Top Voyage Hypothesis</TableHead>
          <TableHead>Most Likely Commodity</TableHead>
          <TableHead>Watchlist Priority</TableHead>
          <TableHead>Promotion Readiness</TableHead>
          <TableHead>Evidence</TableHead>
          <TableHead>Missing Signals</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {candidates.map((candidate) => (
          <TableRow key={candidate.vesselId}>
            <TableCell className="font-medium text-slate-900">{candidate.vesselName}</TableCell>
            <TableCell>{candidate.departurePort}</TableCell>
            <TableCell>{candidate.currentCorridor}</TableCell>
            <TableCell className="max-w-[260px] text-slate-700">{formatVoyageHypothesis(candidate.topVoyageHypothesis)}</TableCell>
            <TableCell>
              <div className="font-medium text-slate-900">{candidate.mostLikelyCommodity}</div>
              <CommodityConfidenceBadge label={candidate.commodityConfidenceLabel} />
            </TableCell>
            <TableCell className="font-semibold text-slate-900">{candidate.watchlistPriorityScore}</TableCell>
            <TableCell className="font-semibold text-slate-900">{candidate.promotionReadinessScore}</TableCell>
            <TableCell>
              <div>{candidate.observationCount} obs</div>
              <div className="text-xs text-slate-500">{candidate.evidenceAgeHours.toFixed(1)} h age</div>
            </TableCell>
            <TableCell className="max-w-[300px] text-slate-700">
              {candidate.missingSignalsForPromotion.length > 0
                ? candidate.missingSignalsForPromotion.join(", ")
                : "No critical blockers"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
