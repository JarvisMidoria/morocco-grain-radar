import { AISProvider } from "@/lib/ais/provider";
import { LatestPosition, PortCallRecord, PortRecord, VesselRecord, VoyageRecord } from "@/lib/types";

export class MarineTrafficProvider implements AISProvider {
  constructor(private readonly apiKey: string) {}

  private assertConfigured() {
    if (!this.apiKey) {
      throw new Error("MarineTraffic API key is missing. Set MARINETRAFFIC_API_KEY.");
    }
  }

  async getExpectedArrivals(portCode: string): Promise<VoyageRecord[]> {
    this.assertConfigured();
    void portCode;
    return [];
  }

  async getPortCalls(portCode: string): Promise<PortCallRecord[]> {
    this.assertConfigured();
    void portCode;
    return [];
  }

  async getVesselDetails(vesselId: string): Promise<VesselRecord | null> {
    this.assertConfigured();
    void vesselId;
    return null;
  }

  async getLatestPositions(vesselIds: string[]): Promise<LatestPosition[]> {
    this.assertConfigured();
    void vesselIds;
    return [];
  }

  async getVoyageData(vesselIds: string[]): Promise<VoyageRecord[]> {
    this.assertConfigured();
    void vesselIds;
    return [];
  }

  async getPorts(): Promise<PortRecord[]> {
    this.assertConfigured();
    return [];
  }

  async getHistoricalRoutePattern(vesselId: string): Promise<string[]> {
    this.assertConfigured();
    void vesselId;
    return [];
  }
}
