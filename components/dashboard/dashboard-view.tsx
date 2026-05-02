"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { CommodityConfidenceBadge } from "@/components/dashboard/commodity-confidence-badge";
import { EarlyCandidatesTable } from "@/components/dashboard/early-candidates-table";
import { FavoriteToggle } from "@/components/dashboard/favorite-toggle";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ScoreBadge } from "@/components/dashboard/score-badge";
import { VesselTable } from "@/components/dashboard/vessel-table";
import { WatchlistFallbackTable } from "@/components/dashboard/watchlist-fallback-table";
import { LiveRadarMap } from "@/components/map/live-radar-map";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CommodityConfidenceLabel,
  DashboardMetrics,
  DetectionPhase,
  MapMode,
  PortRecord,
  RadarVessel,
  WatchlistFallbackCandidate,
} from "@/lib/types";

interface DashboardViewProps {
  vessels: RadarVessel[];
  metrics: DashboardMetrics;
  moroccoPorts: PortRecord[];
  watchlistFallbackCandidates?: WatchlistFallbackCandidate[];
  sourceMode?: "mock" | "live";
  refreshIntervalSeconds?: number;
}

type TableView = "priority" | "tracked" | "watchlist";

function uniqSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function formatCommodity(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatVoyageHypothesis(value: string) {
  return value.replaceAll("_", " ");
}

function phasePriorityWeight(phase: DetectionPhase) {
  switch (phase) {
    case "near_arrival_confirmed":
      return 18;
    case "commodity_hypothesis":
      return 16;
    case "agri_cargo_likely":
      return 14;
    case "morocco_bound_likely":
      return 12;
    case "morocco_bound_suspected":
      return 8;
    case "departure_detected":
    default:
      return 4;
  }
}

function confidencePriorityWeight(label: CommodityConfidenceLabel) {
  switch (label) {
    case "strong hypothesis":
      return 10;
    case "moderate hypothesis":
      return 6;
    case "weak hypothesis":
    default:
      return 2;
  }
}

function decisionConfidence(vessel: RadarVessel) {
  if (
    vessel.moroccoBoundScore >= 80 &&
    vessel.agriCargoScore >= 75 &&
    vessel.commodityConfidenceLabel !== "weak hypothesis"
  ) {
    return "High";
  }

  if (vessel.moroccoBoundScore >= 65 && vessel.agriCargoScore >= 60) {
    return "Medium";
  }

  return "Low";
}

function decisionAction(vessel: RadarVessel) {
  const confidence = decisionConfidence(vessel);
  if (confidence === "High" && vessel.estimatedDaysToMorocco <= 7) {
    return "Watch closely";
  }
  if (confidence === "High" || confidence === "Medium") {
    return "Monitor";
  }
  return "Validate";
}

function confidenceTone(confidence: string) {
  if (confidence === "High") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (confidence === "Medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export function DashboardView({
  vessels,
  metrics,
  moroccoPorts,
  watchlistFallbackCandidates = [],
  sourceMode = "mock",
  refreshIntervalSeconds = 40,
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAnalystDetail, setShowAnalystDetail] = useState(false);
  const [tableView, setTableView] = useState<TableView>("priority");

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

  const priorityCandidates = useMemo(
    () =>
      filtered
        .map((vessel) => {
          const priorityScore = Number(
            (
              vessel.moroccoBoundScore * 0.45 +
              vessel.agriCargoScore * 0.35 +
              phasePriorityWeight(vessel.detectionPhase) +
              confidencePriorityWeight(vessel.commodityConfidenceLabel) +
              Math.min(10, (vessel.observationCount ?? 1) * 1.5)
            ).toFixed(1),
          );

          return { vessel, priorityScore };
        })
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 8),
    [filtered],
  );

  const hasAdmittedVessels = vessels.length > 0;
  const hasWatchlistFallback = watchlistFallbackCandidates.length > 0;
  const arrivalsNext7Days = filtered.filter((vessel) => vessel.estimatedDaysToMorocco <= 7).length;
  const highConfidenceCount = filtered.filter(
    (vessel) =>
      vessel.moroccoBoundScore >= 70 &&
      vessel.agriCargoScore >= 65 &&
      vessel.commodityConfidenceLabel !== "weak hypothesis",
  ).length;

  function resetFilters() {
    setDetectionPhase("All");
    setDestination("All");
    setDeparturePort("All");
    setDepartureCountry("All");
    setMaritimeZone("All");
    setCommodity("All");
    setCommodityConfidence("All");
    setMaxDays("");
    setSearch("");
    setRecentOnly(false);
    setHighAgriOnly(false);
    setMapMode("all_tracked_vessels");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle>Radar Desk</CardTitle>
              <p className="mt-1 text-sm text-slate-600">
                Today: {priorityCandidates.length} vessels worth reviewing, {highConfidenceCount} high confidence, {arrivalsNext7Days} arrivals within 7 days.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link
                href="/opportunities"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 transition-colors hover:bg-slate-50"
              >
                Opportunities
              </Link>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                {filtered.length} tracked
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
                {priorityCandidates.length} to review
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                {arrivalsNext7Days} within 7d
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                Search Vessel / Provenance / Corridor
              </label>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." />
            </div>

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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
            >
              {showAdvancedFilters ? "Hide advanced filters" : "Show advanced filters"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
            >
              Reset filters
            </button>
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
          </div>

          {showAdvancedFilters && (
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-2 xl:grid-cols-5">
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
                <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                  Departure Country
                </label>
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
                <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                  Most Likely Commodity
                </label>
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
                <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                  Commodity Confidence
                </label>
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
                <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Max Days to Morocco</label>
                <Input value={maxDays} onChange={(event) => setMaxDays(event.target.value)} placeholder="e.g. 7" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => setShowAnalystDetail((current) => !current)}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {showAnalystDetail ? "Hide analyst detail" : "Show analyst detail"}
        </button>
      </div>

      <section className="grid min-w-0 items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{hasAdmittedVessels ? "Cargos To Watch" : "Watchlist Candidates"}</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3">
            {hasAdmittedVessels && priorityCandidates.length > 0 && (
              <>
                <p className="text-xs text-slate-500 md:hidden">
                  Swipe sideways to see cargo, ETA, confidence, and open.
                </p>
                <Table className="min-w-[920px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[56px]">Fav</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Vessel / flow</TableHead>
                      <TableHead>Cargo?</TableHead>
                      <TableHead>ETA</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priorityCandidates.map(({ vessel, priorityScore }) => {
                      const confidence = decisionConfidence(vessel);
                      return (
                        <TableRow key={vessel.id}>
                          <TableCell className="align-top">
                            <FavoriteToggle vesselId={vessel.id} initialFavorite={vessel.isFavorite} />
                          </TableCell>
                          <TableCell className="min-w-[130px] align-top">
                            <div className="font-semibold text-slate-900">{decisionAction(vessel)}</div>
                            <div className="mt-1 text-xs text-slate-500">Priority {priorityScore}</div>
                          </TableCell>
                          <TableCell className="min-w-[220px] align-top">
                            <Link href={`/vessels/${vessel.id}`} className="font-semibold text-blue-700 hover:text-blue-800">
                              {vessel.name}
                            </Link>
                            <div className="mt-1 text-xs text-slate-500">
                              {vessel.departurePort}, {vessel.departureCountry} {"->"}{" "}
                              {vessel.destinationPort || vessel.suspectedDestinationRegion}?
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="font-medium text-slate-900">{formatCommodity(vessel.mostLikelyCommodity)}?</div>
                            <div className="mt-1 text-xs text-slate-500">{vessel.commodityConfidenceLabel}</div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="font-medium text-slate-900">
                              {new Date(vessel.eta).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{vessel.estimatedDaysToMorocco.toFixed(1)}d</div>
                          </TableCell>
                          <TableCell className="min-w-[210px] align-top">
                            <Badge className={confidenceTone(confidence)}>{confidence}</Badge>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <ScoreBadge score={vessel.moroccoBoundScore} label="M" />
                              <ScoreBadge score={vessel.agriCargoScore} label="A" />
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              M = Morocco-bound · A = Agri-cargo
                            </div>
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <Link
                              href={`/vessels/${vessel.id}`}
                              aria-label={`Open ${vessel.name} vessel sheet`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                            >
                              <ArrowUpRight className="h-4 w-4" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}

            {!hasAdmittedVessels && hasWatchlistFallback && (
              <ul className="space-y-3">
                {watchlistFallbackCandidates.slice(0, 8).map((candidate) => (
                  <li key={candidate.vesselId} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{candidate.vesselName}</p>
                        <p className="text-xs text-slate-500">Watchlist candidate · needs more evidence</p>
                      </div>
                      <CommodityConfidenceBadge label={candidate.commodityConfidenceLabel} />
                    </div>

                    <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <p>
                        <span className="font-medium text-slate-900">Departure:</span> {candidate.departurePort}
                      </p>
                      <p>
                        <span className="font-medium text-slate-900">Corridor:</span> {candidate.currentCorridor}
                      </p>
                      <p>
                        <span className="font-medium text-slate-900">Hypothesis:</span>{" "}
                        {formatVoyageHypothesis(candidate.topVoyageHypothesis)}
                      </p>
                      <p>
                        <span className="font-medium text-slate-900">Commodity:</span>{" "}
                        {formatCommodity(candidate.mostLikelyCommodity)}
                      </p>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ScoreBadge score={candidate.watchlistPriorityScore} label="Priority" />
                      <ScoreBadge score={candidate.promotionReadinessScore} label="Readiness" />
                      <Badge className="border-slate-200 bg-slate-50 text-slate-700">{candidate.observationCount} obs</Badge>
                    </div>

                    <p className="mt-2 text-xs text-slate-600">
                      Missing signals:{" "}
                      {candidate.missingSignalsForPromotion.length > 0
                        ? candidate.missingSignalsForPromotion.join(", ")
                        : "no critical blockers"}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {hasAdmittedVessels && priorityCandidates.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                No vessels match current filters. Adjust quick filters or open advanced filters.
              </p>
            )}

            {!hasAdmittedVessels && !hasWatchlistFallback && (
              <div className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                <p>No confirmed vessels currently match strict radar criteria.</p>
                <p>Monitoring is active. Candidates will appear as evidence accumulates.</p>
                {sourceMode === "live" && (
                  <p className="text-xs text-slate-500">
                    Inspect{" "}
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
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Map Context</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden px-3 pb-3 pt-0 sm:px-5 sm:pb-5">
            <LiveRadarMap
              initialVessels={filtered}
              moroccoPorts={moroccoPorts}
              refreshIntervalSeconds={refreshIntervalSeconds}
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
      </section>

      {showAnalystDetail ? (
        <section className="space-y-6">
          <KpiCards metrics={metrics} />

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Intelligence Tables</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    Expanded tables for analyst review and candidate QA.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { key: "priority", label: `Priority (${earlyCandidates.length})` },
                      { key: "tracked", label: `Tracked (${filtered.length})` },
                      { key: "watchlist", label: `Watchlist (${watchlistFallbackCandidates.length})` },
                    ] satisfies Array<{ key: TableView; label: string }>
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setTableView(item.key)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        tableView === item.key
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tableView === "priority" && (
                <>
                  {earlyCandidates.length > 0 ? (
                    <EarlyCandidatesTable vessels={earlyCandidates} />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                      No early candidates for the current filter set.
                    </div>
                  )}
                </>
              )}

              {tableView === "tracked" && (
                <>
                  {filtered.length > 0 ? (
                    <VesselTable vessels={filtered} />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                      No tracked vessels match current filters.
                    </div>
                  )}
                </>
              )}

              {tableView === "watchlist" && (
                <>
                  {watchlistFallbackCandidates.length > 0 ? (
                    <WatchlistFallbackTable candidates={watchlistFallbackCandidates} />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                      No visible watchlist candidates right now.
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
