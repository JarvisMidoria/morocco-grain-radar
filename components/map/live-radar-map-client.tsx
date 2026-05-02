"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { LiveRadarMapProps } from "@/components/map/live-radar-map";
import { formatEta, formatRelativeTime } from "@/lib/formatters";
import { DetectionPhase, RadarVessel } from "@/lib/types";

const phaseColor: Record<DetectionPhase, string> = {
  departure_detected: "#64748b",
  morocco_bound_suspected: "#0ea5e9",
  morocco_bound_likely: "#2563eb",
  agri_cargo_likely: "#16a34a",
  commodity_hypothesis: "#15803d",
  near_arrival_confirmed: "#7c3aed",
};

function buildQuery(filters: LiveRadarMapProps["filters"]) {
  const params = new URLSearchParams();

  params.set("detectionPhase", filters.detectionPhase);
  params.set("destination", filters.destination);
  params.set("departurePort", filters.departurePort);
  params.set("departureCountry", filters.departureCountry);
  params.set("maritimeZone", filters.maritimeZone);
  params.set("commodity", filters.commodity);
  params.set("commodityConfidence", filters.commodityConfidence);
  params.set("mapMode", filters.mapMode);

  if (filters.maxDays.trim()) {
    params.set("maxDays", filters.maxDays.trim());
  }

  if (filters.search.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.recentOnly) {
    params.set("recentOnly", "true");
  }

  if (filters.highAgriOnly) {
    params.set("highAgriOnly", "true");
  }

  return params.toString();
}

function phaseLabel(phase: DetectionPhase) {
  return phase.replaceAll("_", " ");
}

export default function LiveRadarMapClient({
  initialVessels,
  moroccoPorts,
  filters,
  refreshIntervalSeconds = 40,
}: LiveRadarMapProps) {
  const [vessels, setVessels] = useState<RadarVessel[]>(initialVessels);
  const refreshIntervalMs = Math.max(15, refreshIntervalSeconds) * 1000;
  const isMobileMap = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const mapCenter: [number, number] = isMobileMap ? [25, -30] : [33.6, -7.5];
  const mapZoom = isMobileMap ? 2 : 4;

  const query = useMemo(() => buildQuery(filters), [filters]);

  useEffect(() => {
    let cancelled = false;

    const fetchLatest = async () => {
      const response = await fetch(`/api/live-vessels?${query}`, {
        cache: "no-store",
      });

      if (!response.ok || cancelled) {
        return;
      }

      const data = (await response.json()) as { vessels: RadarVessel[] };
      if (!cancelled) {
        setVessels(data.vessels);
      }
    };

    fetchLatest();
    const timer = window.setInterval(fetchLatest, refreshIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [query, refreshIntervalMs]);

  return (
    <div className="relative z-0 h-[420px] min-h-[320px] w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-[500px] lg:h-[560px] lg:min-h-[420px]">
      <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom className="z-0 h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {moroccoPorts.map((port) => (
          <CircleMarker
            key={port.id}
            center={[port.lat, port.lon]}
            radius={7}
            pathOptions={{
              color: "#1d4ed8",
              fillColor: "#93c5fd",
              fillOpacity: 0.9,
              weight: 2,
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              <div className="text-xs font-semibold">{port.name}</div>
            </Tooltip>
          </CircleMarker>
        ))}

        {vessels.map((vessel) => {
          const color = phaseColor[vessel.detectionPhase];
          return (
            <Fragment key={vessel.id}>
              <Polyline
                positions={vessel.routePoints.map((point) => [point.lat, point.lon])}
                pathOptions={{ color: "#94a3b8", opacity: 0.45, weight: 2, dashArray: "8 8" }}
              />

              <CircleMarker
                center={[vessel.currentLat, vessel.currentLon]}
                radius={Math.max(6, Math.min(12, 5 + vessel.moroccoBoundScore / 20))}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.85,
                  weight: 2,
                }}
              >
                <Popup minWidth={280}>
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold text-slate-900">{vessel.name}</div>
                    <div>Type: {vessel.vesselType}</div>
                    <div>Departure: {vessel.departurePort} ({vessel.departureCountry})</div>
                    <div>Time since departure: {vessel.timeSinceDepartureHours.toFixed(1)}h</div>
                    <div>Zone: {vessel.currentMaritimeZone}</div>
                    <div>Destination hypothesis: {vessel.suspectedDestinationRegion}</div>
                    <div>ETA: {formatEta(vessel.eta)}</div>
                    <div>Phase: {phaseLabel(vessel.detectionPhase)}</div>
                    <div>Morocco-bound: {vessel.moroccoBoundScore}</div>
                    <div>Agri cargo: {vessel.agriCargoScore}</div>
                    <div>
                      Commodity: {vessel.mostLikelyCommodity} ({vessel.commodityConfidenceLabel})
                    </div>
                    <div className="text-xs text-slate-500">Signal {formatRelativeTime(vessel.lastSignalAt)}</div>
                  </div>
                </Popup>
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
