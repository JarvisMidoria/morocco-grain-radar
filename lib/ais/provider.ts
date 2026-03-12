import { LatestPosition, PortCallRecord, PortRecord, VesselRecord, VoyageRecord } from "@/lib/types";

export interface AISProvider {
  getExpectedArrivals(portCode: string): Promise<VoyageRecord[]>;
  getPortCalls(portCode: string): Promise<PortCallRecord[]>;
  getVesselDetails(vesselId: string): Promise<VesselRecord | null>;
  getLatestPositions(vesselIds: string[]): Promise<LatestPosition[]>;
  getVoyageData(vesselIds: string[]): Promise<VoyageRecord[]>;
  getPorts(): Promise<PortRecord[]>;
  getHistoricalRoutePattern(vesselId: string): Promise<string[]>;
}
