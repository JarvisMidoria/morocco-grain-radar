import Link from "next/link";
import { FavoriteToggle } from "@/components/dashboard/favorite-toggle";
import { ActionabilityBadge } from "@/components/opportunities/actionability-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEta } from "@/lib/formatters";
import { getRadarVessels } from "@/lib/radar/service";
import { getFavoriteVessels } from "@/lib/settings/store";
import { buildTraderActionabilitySnapshot } from "@/lib/trader/actionability";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatCommodity(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function FavoritesPage() {
  const [vessels, favorites] = await Promise.all([getRadarVessels(), Promise.resolve(getFavoriteVessels())]);
  const favoriteMetadata = new Map(favorites.map((favorite, index) => [favorite.vesselId, { ...favorite, index }]));
  const favoriteVessels = vessels
    .filter((vessel) => favoriteMetadata.has(vessel.id))
    .sort((a, b) => {
      const left = favoriteMetadata.get(a.id)?.index ?? Number.MAX_SAFE_INTEGER;
      const right = favoriteMetadata.get(b.id)?.index ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    });
  const favoriteVesselIds = new Set(favoriteVessels.map((vessel) => vessel.id));
  const missingFavoriteIds = favorites
    .filter((favorite) => !favoriteVesselIds.has(favorite.vesselId))
    .map((favorite) => favorite.vesselId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Favorites</h1>
          <p className="text-sm text-slate-500">
            Vessels you marked from Radar, Opportunities, or an individual vessel sheet.
          </p>
        </div>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to radar
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Favorite Vessels</CardTitle>
          <CardDescription>
            {favoriteVessels.length} currently visible favorite vessel{favoriteVessels.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {favoriteVessels.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Cargo?</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {favoriteVessels.map((vessel) => {
                  const actionability = buildTraderActionabilitySnapshot(vessel);
                  const favorite = favoriteMetadata.get(vessel.id);

                  return (
                    <TableRow key={vessel.id}>
                      <TableCell className="align-top">
                        <div className="flex items-start gap-3">
                          <FavoriteToggle vesselId={vessel.id} initialFavorite={vessel.isFavorite} refreshOnChange />
                          <div>
                            <Link href={`/vessels/${vessel.id}`} className="font-medium text-blue-700 hover:text-blue-800">
                              {vessel.name}
                            </Link>
                            <div className="mt-1 text-xs text-slate-500">
                              IMO {vessel.imo || "N/A"}
                              {favorite ? ` · saved ${formatEta(favorite.timestamp)}` : ""}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-700">
                        <div>
                          {vessel.departurePort}, {vessel.departureCountry}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          to {vessel.destinationPort || vessel.suspectedDestinationRegion}?
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-700">
                        <div className="font-medium text-slate-900">{formatCommodity(vessel.mostLikelyCommodity)}?</div>
                        <div className="mt-1 text-xs text-slate-500">{vessel.commodityConfidenceLabel}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <ActionabilityBadge band={actionability.band} score={actionability.score} />
                          <Badge className="border-blue-200 bg-blue-50 text-blue-700">M {vessel.moroccoBoundScore}</Badge>
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">A {vessel.agriCargoScore}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-slate-700">
                        {formatEta(vessel.eta)}
                        <div className="mt-1 text-xs text-slate-500">
                          {vessel.estimatedDaysToMorocco.toFixed(1)}d to Morocco
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <Link href={`/vessels/${vessel.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
              No favorite vessel yet. Use the star on Radar, Opportunities, or a vessel sheet to keep it here.
            </div>
          )}
        </CardContent>
      </Card>

      {missingFavoriteIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Not In Current Feed</CardTitle>
            <CardDescription>These saved vessel IDs are no longer visible in the current radar dataset.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {missingFavoriteIds.map((vesselId) => (
                <Badge key={vesselId}>{vesselId}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
