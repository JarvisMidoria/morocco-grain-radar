"use client";

import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { RadarVessel } from "@/lib/types";

interface VesselMiniMapClientProps {
  vessel: RadarVessel;
}

export default function VesselMiniMapClient({ vessel }: VesselMiniMapClientProps) {
  return (
    <div className="h-[320px] w-full overflow-hidden rounded-xl border border-slate-200">
      <MapContainer center={[vessel.currentLat, vessel.currentLon]} zoom={6} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polyline
          positions={vessel.routePoints.map((point) => [point.lat, point.lon])}
          pathOptions={{ color: "#64748b", opacity: 0.7, weight: 3, dashArray: "8 8" }}
        />

        {vessel.routePoints.map((point) => (
          <CircleMarker
            key={`${vessel.id}-${point.label}`}
            center={[point.lat, point.lon]}
            radius={point.label.startsWith("Current") ? 8 : 6}
            pathOptions={{
              color: point.label.startsWith("Current") ? "#2563eb" : "#94a3b8",
              fillColor: point.label.startsWith("Current") ? "#60a5fa" : "#cbd5e1",
              fillOpacity: 0.9,
              weight: 2,
            }}
          >
            <Tooltip>{point.label}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
