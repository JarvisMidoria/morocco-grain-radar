import dynamic from "next/dynamic";
import { RadarVessel } from "@/lib/types";

const VesselMiniMapClient = dynamic(() => import("@/components/map/vessel-mini-map-client"), {
  ssr: false,
});

interface VesselMiniMapProps {
  vessel: RadarVessel;
}

export function VesselMiniMap({ vessel }: VesselMiniMapProps) {
  return <VesselMiniMapClient vessel={vessel} />;
}
