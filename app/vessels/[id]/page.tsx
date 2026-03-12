import { notFound } from "next/navigation";
import { CommodityConfidenceBadge } from "@/components/dashboard/commodity-confidence-badge";
import { DetectionPhaseBadge } from "@/components/dashboard/detection-phase-badge";
import { FavoriteToggle } from "@/components/dashboard/favorite-toggle";
import { VesselMiniMap } from "@/components/map/vessel-mini-map";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAISProvider } from "@/lib/ais/factory";
import { formatEta, formatRelativeTime } from "@/lib/formatters";
import { getRadarVesselById } from "@/lib/radar/service";

interface VesselDetailPageProps {
  params: {
    id: string;
  };
}

export const dynamic = "force-dynamic";

export default async function VesselDetailPage({ params }: VesselDetailPageProps) {
  const vessel = await getRadarVesselById(params.id);
  if (!vessel) {
    notFound();
  }

  const provider = getAISProvider();
  const [ports, historicalRoute] = await Promise.all([
    provider.getPorts(),
    provider.getHistoricalRoutePattern(vessel.id),
  ]);

  const portById = new Map(ports.map((port) => [port.id, port]));
  const historicalPorts = historicalRoute
    .map((portId) => portById.get(portId))
    .filter((port): port is NonNullable<typeof port> => Boolean(port));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{vessel.name}</h1>
            <FavoriteToggle vesselId={vessel.id} initialFavorite={vessel.isFavorite} />
          </div>
          <p className="text-sm text-slate-500">IMO {vessel.imo} · MMSI {vessel.mmsi} · {vessel.vesselType}</p>
        </div>
        <div className="flex items-center gap-3">
          <DetectionPhaseBadge phase={vessel.detectionPhase} />
          <div className="text-right">
            <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Morocco-Bound</div>
            <div className="text-3xl font-semibold text-slate-900">{vessel.moroccoBoundScore}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Routing History & Mini Map</CardTitle>
            <CardDescription>
              Departure {vessel.departurePort} ({vessel.departureCountry}) through {vessel.currentMaritimeZone} toward {vessel.suspectedDestinationRegion}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VesselMiniMap vessel={vessel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Departure Intelligence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Departure port</span>
              <span className="font-medium text-slate-900">{vessel.departurePort}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Departure country</span>
              <span className="font-medium text-slate-900">{vessel.departureCountry}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Departure time</span>
              <span className="font-medium text-slate-900">{formatEta(vessel.departureDetectedAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Time since departure</span>
              <span className="font-medium text-slate-900">{vessel.timeSinceDepartureHours.toFixed(1)} h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Observation count</span>
              <span className="font-medium text-slate-900">{vessel.observationCount ?? 1}</span>
            </div>
            {vessel.firstSeenAt && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">First seen</span>
                <span className="font-medium text-slate-900">{formatEta(vessel.firstSeenAt)}</span>
              </div>
            )}
            {vessel.lastSeenAt && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Last seen</span>
                <span className="font-medium text-slate-900">{formatEta(vessel.lastSeenAt)}</span>
              </div>
            )}
            {typeof vessel.evidenceAgeHours === "number" && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Evidence age</span>
                <span className="font-medium text-slate-900">{vessel.evidenceAgeHours.toFixed(1)} h</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Current maritime zone</span>
              <span className="font-medium text-slate-900">{vessel.currentMaritimeZone}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Suspected destination region</span>
              <span className="font-medium text-slate-900">{vessel.suspectedDestinationRegion}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Estimated days to Morocco</span>
              <span className="font-medium text-slate-900">{vessel.estimatedDaysToMorocco.toFixed(1)} d</span>
            </div>
            <div className="text-xs text-slate-500">Last signal {formatRelativeTime(vessel.lastSignalAt)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Morocco-Bound Reasoning</CardTitle>
            <CardDescription>Explainable score based on departure origin, route behavior, and destination hints.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 text-2xl font-semibold text-slate-900">{vessel.moroccoBoundScore}</div>
            <ul className="space-y-2 text-sm text-slate-700">
              {vessel.moroccoBoundReasons.map((reason) => (
                <li key={reason} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agri-Cargo Reasoning</CardTitle>
            <CardDescription>Dry agri/feed likelihood separated from Morocco directionality.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 text-2xl font-semibold text-slate-900">{vessel.agriCargoScore}</div>
            <ul className="space-y-2 text-sm text-slate-700">
              {vessel.agriCargoReasons.map((reason) => (
                <li key={reason} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Commodity Hypothesis</CardTitle>
            <CardDescription>Heuristic probability profile (not certainty).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Most likely commodity</span>
              <span className="font-medium text-slate-900">{vessel.mostLikelyCommodity}</span>
            </div>
            <div>
              <CommodityConfidenceBadge label={vessel.commodityConfidenceLabel} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 p-3">Wheat: {vessel.commodityScores.wheatScore}</div>
              <div className="rounded-lg border border-slate-200 p-3">Barley: {vessel.commodityScores.barleyScore}</div>
              <div className="rounded-lg border border-slate-200 p-3">Corn: {vessel.commodityScores.cornScore}</div>
              <div className="rounded-lg border border-slate-200 p-3">Soybean meal: {vessel.commodityScores.soybeanMealScore}</div>
            </div>
            <ul className="space-y-2 text-sm text-slate-700">
              {vessel.commodityReasons.map((reason) => (
                <li key={reason} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Routing History</CardTitle>
            <CardDescription>Previous port calls pattern supporting explainability.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-slate-700">
              {historicalPorts.length > 0 ? (
                historicalPorts.map((port) => (
                  <li key={`${vessel.id}-${port.id}`} className="rounded-lg border border-slate-200 px-3 py-2">
                    {port.name} · {port.country}
                  </li>
                ))
              ) : (
                <li className="rounded-lg border border-slate-200 px-3 py-2 text-slate-500">No historical port calls.</li>
              )}
            </ul>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Destination text: <span className="font-medium text-slate-900">{vessel.destinationText}</span>
              <br />
              ETA: <span className="font-medium text-slate-900">{formatEta(vessel.eta)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
