import {
  GRAIN_ORIGIN_PORT_IDS,
  MOROCCO_DESTINATION_PORT_IDS,
  buildMockDataset,
} from "@/lib/data/mock-dataset";
import { AISProvider } from "@/lib/ais/provider";
import { LatestPosition, PortCallRecord, PortRecord, VesselRecord, VoyageRecord } from "@/lib/types";

const dataset = buildMockDataset();

const portById = new Map(dataset.ports.map((port) => [port.id, port]));
const portByCode = new Map(dataset.ports.map((port) => [port.code, port]));
const vesselById = new Map(dataset.vessels.map((vessel) => [vessel.id, vessel]));
const voyageByVessel = new Map(dataset.voyages.map((voyage) => [voyage.vesselId, voyage]));

function hashCode(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clampLat(lat: number) {
  return Math.max(-85, Math.min(85, lat));
}

function normalizeLon(lon: number) {
  if (lon > 180) {
    return lon - 360;
  }
  if (lon < -180) {
    return lon + 360;
  }
  return lon;
}

function projectPosition(
  lat: number,
  lon: number,
  speed: number,
  course: number,
  elapsedHours: number,
  jitterSeed: string,
) {
  const distanceNm = speed * elapsedHours;
  const courseRad = (course * Math.PI) / 180;
  const deltaLat = (distanceNm * Math.cos(courseRad)) / 60;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const deltaLon = (distanceNm * Math.sin(courseRad)) / (60 * cosLat);

  const jitterIndex = Math.floor(Date.now() / 45000);
  const jitterBase = hashCode(`${jitterSeed}-${jitterIndex}`) % 21;
  const jitter = (jitterBase - 10) * 0.0012;

  return {
    lat: clampLat(lat + deltaLat + jitter),
    lon: normalizeLon(lon + deltaLon - jitter / 2),
  };
}

function simulateVoyage(voyage: VoyageRecord): VoyageRecord {
  const elapsedHours = (((Date.now() - new Date(voyage.lastSignalAt).getTime()) / 3_600_000) % 0.9) + 0.05;
  const projected = projectPosition(
    voyage.currentLat,
    voyage.currentLon,
    voyage.speed,
    voyage.course,
    elapsedHours,
    voyage.vesselId,
  );

  return {
    ...voyage,
    currentLat: projected.lat,
    currentLon: projected.lon,
    lastSignalAt: new Date().toISOString(),
  };
}

export class MockAISProvider implements AISProvider {
  async getExpectedArrivals(portCode: string) {
    const port = portByCode.get(portCode);
    if (!port) {
      return [];
    }

    return dataset.voyages
      .filter((voyage) => voyage.destinationPortId === port.id)
      .map((voyage) => simulateVoyage(voyage))
      .sort((a, b) => new Date(a.eta).getTime() - new Date(b.eta).getTime());
  }

  async getPortCalls(portCode: string) {
    const port = portByCode.get(portCode);
    if (!port) {
      return [];
    }

    return dataset.portCalls
      .filter((portCall) => portCall.portId === port.id)
      .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());
  }

  async getVesselDetails(vesselId: string) {
    return vesselById.get(vesselId) ?? null;
  }

  async getLatestPositions(vesselIds: string[]) {
    const positions: LatestPosition[] = [];

    for (const vesselId of vesselIds) {
      const voyage = voyageByVessel.get(vesselId);
      if (!voyage) {
        continue;
      }
      const simulated = simulateVoyage(voyage);
      positions.push({
        vesselId,
        lat: simulated.currentLat,
        lon: simulated.currentLon,
        speed: simulated.speed,
        course: simulated.course,
        heading: simulated.heading,
        timestamp: simulated.lastSignalAt,
      });
    }

    return positions;
  }

  async getVoyageData(vesselIds: string[]) {
    return vesselIds
      .map((vesselId) => voyageByVessel.get(vesselId))
      .filter((voyage): voyage is VoyageRecord => Boolean(voyage))
      .map((voyage) => simulateVoyage(voyage));
  }

  async getPorts() {
    return dataset.ports;
  }

  async getHistoricalRoutePattern(vesselId: string) {
    return dataset.historicalRoutesByVessel[vesselId] ?? [];
  }
}

export const mockReferenceSets = {
  grainOrigins: GRAIN_ORIGIN_PORT_IDS,
  moroccoDestinations: MOROCCO_DESTINATION_PORT_IDS,
  ports: dataset.ports,
};

export function findPortById(portId: string): PortRecord | undefined {
  return portById.get(portId);
}

export function findVesselById(vesselId: string): VesselRecord | undefined {
  return vesselById.get(vesselId);
}

export function getAllPortCalls(): PortCallRecord[] {
  return dataset.portCalls;
}
