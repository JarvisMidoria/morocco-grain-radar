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
  loading: () => (
    <div className="flex h-[560px] min-h-[420px] w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500">
      Loading map...
    </div>
  ),
});

export function LiveRadarMap(props: LiveRadarMapProps) {
  return <LiveRadarMapClient {...props} />;
}
