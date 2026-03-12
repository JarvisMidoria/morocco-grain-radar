"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EarlyCandidatesTable } from "@/components/dashboard/early-candidates-table";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { VesselTable } from "@/components/dashboard/vessel-table";
import { WatchlistFallbackTable } from "@/components/dashboard/watchlist-fallback-table";
import { LiveRadarMap } from "@/components/map/live-radar-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardMetrics, MapMode, PortRecord, RadarVessel, WatchlistFallbackCandidate } from "@/lib/types";

interface DashboardViewProps {
  vessels: RadarVessel[];
  metrics: DashboardMetrics;
  moroccoPorts: PortRecord[];
  watchlistFallbackCandidates?: WatchlistFallbackCandidate[];
  sourceMode?: "mock" | "live";
}

function uniqSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function DashboardView({
  vessels,
  metrics,
  moroccoPorts,
  watchlistFallbackCandidates = [],
  sourceMode = "mock",
}: DashboardViewProps) {
  const [detectionPhase, setDetectionPhase] = useState<string>("All");
  const [destination, setDestination] = useState<string>("All");
  const [departurePort, setDeparturePort] = useState<string>("All");
  const [departureCountry, setDepartureCountry] = useState<string>("All");
  const [maritimeZone, setMaritimeZone] = useState<string>("All");
  const [commodity, setCommodity] = useState<string>("All");
  const [commodityConfidence, setCommodityConfidence] = useState<string>("All");
  const [maxDays, setMaxDays] = useState<string>("");
  const [search, setSearch] = useState("");
  const [recentOnly, setRecentOnly] = useState(false);
  const [highAgriOnly, setHighAgriOnly] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>("all_tracked_vessels");

  const options = useMemo(
    () => ({
      departurePorts: Array.from(
        new Map(vessels.map((vessel) => [vessel.departurePortCode, vessel.departurePort])).entries(),
      )
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      departureCountries: uniqSorted(vessels.map((vessel) => vessel.departureCountry)),
      maritimeZones: uniqSorted(vessels.map((vessel) => vessel.currentMaritimeZone)),
      detectionPhases: uniqSorted(vessels.map((vessel) => vessel.detectionPhase)),
      commodities: uniqSorted(vessels.map((vessel) => vessel.mostLikelyCommodity)),
      commodityConfidenceLabels: uniqSorted(vessels.map((vessel) => vessel.commodityConfidenceLabel)),
    }),
    [vessels],
  );

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const maxDaysValue = maxDays.trim() ? Number(maxDays) : null;

    return vessels.filter((vessel) => {
      if (detectionPhase !== "All" && vessel.detectionPhase !== detectionPhase) {
        return false;
      }

      if (destination !== "All" && vessel.destinationPortCode !== destination) {
        return false;
      }

      if (departurePort !== "All" && vessel.departurePortCode !== departurePort) {
        return false;
      }

      if (departureCountry !== "All" && vessel.departureCountry !== departureCountry) {
        return false;
      }

      if (maritimeZone !== "All" && vessel.currentMaritimeZone !== maritimeZone) {
        return false;
      }

      if (commodity !== "All" && vessel.mostLikelyCommodity !== commodity) {
        return false;
      }

      if (commodityConfidence !== "All" && vessel.commodityConfidenceLabel !== commodityConfidence) {
        return false;
      }

      if (typeof maxDaysValue === "number" && !Number.isNaN(maxDaysValue) && vessel.estimatedDaysToMorocco > maxDaysValue) {
        return false;
      }

      if (recentOnly && vessel.timeSinceDepartureHours > 24) {
        return false;
      }

      if (highAgriOnly && vessel.agriCargoScore < 70) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        vessel.name,
        vessel.vesselType,
        vessel.departurePort,
        vessel.departureCountry,
        vessel.currentMaritimeZone,
        vessel.suspectedDestinationRegion,
        vessel.destinationPort,
        vessel.mostLikelyCommodity,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [
    commodity,
    commodityConfidence,
    departureCountry,
    departurePort,
    destination,
    detectionPhase,
    highAgriOnly,
    maritimeZone,
    maxDays,
    recentOnly,
    search,
    vessels,
  ]);

  const earlyCandidates = useMemo(
    () =>
      filtered
        .filter(
          (vessel) =>
            vessel.timeSinceDepartureHours <= 72 && vessel.moroccoBoundScore >= 45 && vessel.agriCargoScore >= 40,
        )
        .sort((a, b) => {
          if (b.moroccoBoundScore !== a.moroccoBoundScore) {
            return b.moroccoBoundScore - a.moroccoBoundScore;
          }

          return a.timeSinceDepartureHours - b.timeSinceDepartureHours;
        })
        .slice(0, 15),
    [filtered],
  );

  const hasAdmittedVessels = vessels.length > 0;
  const hasWatchlistFallback = !hasAdmittedVessels && watchlistFallbackCandidates.length > 0;
  const showStrictEmptyState = !hasAdmittedVessels && watchlistFallbackCandidates.length === 0;

  return (
    <div className="space-y-6">
      <KpiCards metrics={metrics} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Radar Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Map Mode</label>
            <select
              value={mapMode}
              onChange={(event) => setMapMode(event.target.value as MapMode)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="all_tracked_vessels">All tracked vessels</option>
              <option value="early_detected_only">Early-detected only</option>
              <option value="approaching_morocco_only">Approaching Morocco only</option>
              <option value="agri_cargo_likely_only">Agri-cargo likely only</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Detection Phase</label>
            <select
              value={detectionPhase}
              onChange={(event) => setDetectionPhase(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="All">All</option>
              {options.detectionPhases.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Departure Port</label>
            <select
              value={departurePort}
              onChange={(event) => setDeparturePort(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="All">All</option>
              {options.departurePorts.map((value) => (
                <option key={value.code} value={value.code}>
                  {value.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Departure Country</label>
            <select
              value={departureCountry}
              onChange={(event) => setDepartureCountry(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="All">All</option>
              {options.departureCountries.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Maritime Zone</label>
            <select
              value={maritimeZone}
              onChange={(event) => setMaritimeZone(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="All">All</option>
              {options.maritimeZones.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Destination Port</label>
            <select
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="All">All</option>
              {moroccoPorts.map((port) => (
                <option key={port.code} value={port.code}>
                  {port.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Most Likely Commodity</label>
            <select
              value={commodity}
              onChange={(event) => setCommodity(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="All">All</option>
              {options.commodities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Commodity Confidence</label>
            <select
              value={commodityConfidence}
              onChange={(event) => setCommodityConfidence(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="All">All</option>
              {options.commodityConfidenceLabels.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Max Days to Morocco</label>
            <Input value={maxDays} onChange={(event) => setMaxDays(event.target.value)} placeholder="e.g. 7" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Search Vessel / Provenance / Corridor</label>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." />
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={recentOnly}
              onChange={(event) => setRecentOnly(event.target.checked)}
              className="rounded border-slate-300"
            />
            Only recent departures
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={highAgriOnly}
              onChange={(event) => setHighAgriOnly(event.target.checked)}
              className="rounded border-slate-300"
            />
            Only high agri-cargo score
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Early Detected Candidates ({earlyCandidates.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <EarlyCandidatesTable vessels={earlyCandidates} />
        </CardContent>
      </Card>

      {hasWatchlistFallback && (
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>Watchlist Candidates Fallback ({watchlistFallbackCandidates.length})</CardTitle>
            <p className="text-sm text-slate-600">
              No admitted vessels currently match strict radar admission. These candidates are being monitored and
              are <span className="font-medium text-amber-700">not yet confirmed</span>.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                Watchlist candidate
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Needs more evidence</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Strict admission unchanged</span>
            </div>
            <WatchlistFallbackTable candidates={watchlistFallbackCandidates} />
          </CardContent>
        </Card>
      )}

      {showStrictEmptyState && (
        <Card>
          <CardHeader>
            <CardTitle>No Confirmed Radar Vessels Right Now</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>No confirmed vessels currently match the strict radar criteria.</p>
            <p>Live monitoring is still running and candidates will appear as evidence accumulates.</p>
            {sourceMode === "live" && (
              <p className="text-xs text-slate-500">
                Inspect raw signals via{" "}
                <Link href="/api/live-vessels?debug=1" className="text-blue-600 hover:text-blue-700">
                  debug mode
                </Link>{" "}
                or{" "}
                <Link
                  href="/api/live-vessels?debug=1&evaluation=1&windowHours=48"
                  className="text-blue-600 hover:text-blue-700"
                >
                  evaluation mode
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Live Maritime Radar</CardTitle>
        </CardHeader>
        <CardContent>
          <LiveRadarMap
            initialVessels={filtered}
            moroccoPorts={moroccoPorts}
            filters={{
              detectionPhase,
              destination,
              departurePort,
              departureCountry,
              maritimeZone,
              commodity,
              commodityConfidence,
              maxDays,
              search,
              recentOnly,
              highAgriOnly,
              mapMode,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tracked Vessels ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length > 0 ? (
            <VesselTable vessels={filtered} />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              {hasWatchlistFallback
                ? "No admitted vessels currently match filters. Watchlist fallback candidates are shown above."
                : "No admitted vessels currently match strict radar criteria or active filters."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
