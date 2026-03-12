import dynamic from "next/dynamic";
import { MapMode, PortRecord, RadarVessel } from "@/lib/types";

export interface LiveRadarMapProps {
  initialVessels: RadarVessel[];
  moroccoPorts: PortRecord[];
  refreshIntervalSeconds?: number;
  filters: {
    detectionPhase: string;
    destination: string;
    departurePort: string;
    departureCountry: string;
    maritimeZone: string;
    commodity: string;
    commodityConfidence: string;
    maxDays: string;
    search: string;
    recentOnly: boolean;
    highAgriOnly: boolean;
    mapMode: MapMode;
  };
}

const LiveRadarMapClient = dynamic(() => import("@/components/map/live-radar-map-client"), {
  ssr: false,
});

export function LiveRadarMap(props: LiveRadarMapProps) {
  return <LiveRadarMapClient {...props} />;
}
