import { isPrismaAvailable, prisma } from "@/lib/db/prisma";
import { PortCallRecord, PortRecord, RadarVessel } from "@/lib/types";

interface PersistLiveSnapshotInput {
  provider: string;
  ports: PortRecord[];
  vessels: RadarVessel[];
  portCalls: PortCallRecord[];
}

interface PersistLiveSnapshotResult {
  persisted: boolean;
  error?: string;
  errorCode?: "DB_UNAVAILABLE" | "PERSISTENCE_FAILED";
}

function toConfidenceLevel(value: RadarVessel["confidenceLevel"]): "HIGH" | "MEDIUM" | "LOW" {
  if (value === "High") {
    return "HIGH";
  }

  if (value === "Medium") {
    return "MEDIUM";
  }

  return "LOW";
}

function toCommodityConfidenceLabel(
  value: RadarVessel["commodityConfidenceLabel"],
): "STRONG" | "MODERATE" | "WEAK" {
  if (value === "strong hypothesis") {
    return "STRONG";
  }

  if (value === "moderate hypothesis") {
    return "MODERATE";
  }

  return "WEAK";
}

function toDetectionPhase(value: RadarVessel["detectionPhase"]): RadarVessel["detectionPhase"] {
  return value;
}

function uniquePortCalls(calls: PortCallRecord[]) {
  const map = new Map<string, PortCallRecord>();
  for (const call of calls) {
    map.set(call.id, call);
  }
  return Array.from(map.values());
}

function isDbUnavailableError(error: unknown) {
  if (error && typeof error === "object") {
    const typed = error as { name?: string; code?: string };
    if (typed.name === "PrismaClientInitializationError") {
      return true;
    }
    if (typed.name === "PrismaClientKnownRequestError") {
      return ["P1001", "P1002", "P1017"].includes(typed.code ?? "");
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (!message) {
    return false;
  }

  return (
    message.includes("can't reach database server") ||
    message.includes("failed to connect") ||
    message.includes("connection refused") ||
    message.includes("econnrefused") ||
    message.includes("server closed the connection") ||
    message.includes("timed out fetching a new connection")
  );
}

export async function persistLiveRadarSnapshot(
  input: PersistLiveSnapshotInput,
): Promise<PersistLiveSnapshotResult> {
  if (!isPrismaAvailable || !prisma) {
    return {
      persisted: false,
      errorCode: "DB_UNAVAILABLE",
      error: "Prisma engine unavailable in local runtime.",
    };
  }

  try {
    const portIds = new Set(input.ports.map((port) => port.id));
    const portIdByCode = new Map(input.ports.map((port) => [port.code, port.id]));
    const vesselIds = new Set(input.vessels.map((vessel) => vessel.id));

    for (const port of input.ports) {
      await prisma.port.upsert({
        where: { code: port.code },
        update: {
          name: port.name,
          country: port.country,
          lat: port.lat,
          lon: port.lon,
          isMoroccoDestination: port.isMoroccoDestination,
          isLikelyGrainOrigin: port.isLikelyGrainOrigin,
        },
        create: {
          id: port.id,
          name: port.name,
          country: port.country,
          code: port.code,
          lat: port.lat,
          lon: port.lon,
          isMoroccoDestination: port.isMoroccoDestination,
          isLikelyGrainOrigin: port.isLikelyGrainOrigin,
        },
      });
    }

    for (const vessel of input.vessels) {
      await prisma.vessel.upsert({
        where: { id: vessel.id },
        update: {
          imo: vessel.imo,
          mmsi: vessel.mmsi,
          name: vessel.name,
          vesselType: vessel.vesselType,
          flag: vessel.flag,
          deadweight: Math.round(vessel.deadweight),
          length: vessel.length,
          width: vessel.width,
          lastDraft: vessel.lastDraft,
        },
        create: {
          id: vessel.id,
          imo: vessel.imo,
          mmsi: vessel.mmsi,
          name: vessel.name,
          vesselType: vessel.vesselType,
          flag: vessel.flag,
          deadweight: Math.round(vessel.deadweight),
          length: vessel.length,
          width: vessel.width,
          lastDraft: vessel.lastDraft,
        },
      });

      const destinationPortId = portIdByCode.get(vessel.destinationPortCode) ?? null;
      const previousPortId = portIdByCode.get(vessel.previousPortCode) ?? null;
      const departurePortId = portIdByCode.get(vessel.departurePortCode) ?? previousPortId;

      await prisma.voyage.upsert({
        where: { id: `live-${input.provider}-${vessel.id}` },
        update: {
          vesselId: vessel.id,
          currentLat: vessel.currentLat,
          currentLon: vessel.currentLon,
          speed: vessel.speed,
          course: vessel.course,
          heading: vessel.heading,
          destinationText: vessel.destinationText,
          eta: new Date(vessel.eta),
          originCountry: vessel.originCountry,
          lastSignalAt: new Date(vessel.lastSignalAt),
          departureDetectedAt: new Date(vessel.departureDetectedAt),
          timeSinceDepartureHours: vessel.timeSinceDepartureHours,
          estimatedDaysToMorocco: vessel.estimatedDaysToMorocco,
          currentMaritimeZone: vessel.currentMaritimeZone,
          suspectedDestinationRegion: vessel.suspectedDestinationRegion,
          detectionPhase: toDetectionPhase(vessel.detectionPhase),
          destinationPortId,
          previousPortId,
          departurePortId,
        },
        create: {
          id: `live-${input.provider}-${vessel.id}`,
          vesselId: vessel.id,
          currentLat: vessel.currentLat,
          currentLon: vessel.currentLon,
          speed: vessel.speed,
          course: vessel.course,
          heading: vessel.heading,
          destinationText: vessel.destinationText,
          eta: new Date(vessel.eta),
          originCountry: vessel.originCountry,
          lastSignalAt: new Date(vessel.lastSignalAt),
          departureDetectedAt: new Date(vessel.departureDetectedAt),
          timeSinceDepartureHours: vessel.timeSinceDepartureHours,
          estimatedDaysToMorocco: vessel.estimatedDaysToMorocco,
          currentMaritimeZone: vessel.currentMaritimeZone,
          suspectedDestinationRegion: vessel.suspectedDestinationRegion,
          detectionPhase: toDetectionPhase(vessel.detectionPhase),
          destinationPortId,
          previousPortId,
          departurePortId,
        },
      });

      await prisma.grainAssessment.upsert({
        where: { vesselId: vessel.id },
        update: {
          score: vessel.score,
          confidenceLevel: toConfidenceLevel(vessel.confidenceLevel),
          moroccoBoundScore: vessel.moroccoBoundScore,
          agriCargoScore: vessel.agriCargoScore,
          wheatScore: vessel.commodityScores.wheatScore,
          barleyScore: vessel.commodityScores.barleyScore,
          cornScore: vessel.commodityScores.cornScore,
          soybeanMealScore: vessel.commodityScores.soybeanMealScore,
          mostLikelyCommodity: vessel.mostLikelyCommodity,
          commodityConfidenceLabel: toCommodityConfidenceLabel(vessel.commodityConfidenceLabel),
          detectionPhase: toDetectionPhase(vessel.detectionPhase),
          reasonsJson: {
            moroccoBoundReasons: vessel.moroccoBoundReasons,
            agriCargoReasons: vessel.agriCargoReasons,
            commodityReasons: vessel.commodityReasons,
            provider: input.provider,
            snapshotCapturedAt: new Date().toISOString(),
          },
          scoringReasonsJson: {
            moroccoBoundReasons: vessel.moroccoBoundReasons,
            agriCargoReasons: vessel.agriCargoReasons,
            provider: input.provider,
          },
          commodityReasonsJson: {
            commodityReasons: vessel.commodityReasons,
            provider: input.provider,
          },
        },
        create: {
          vesselId: vessel.id,
          score: vessel.score,
          confidenceLevel: toConfidenceLevel(vessel.confidenceLevel),
          moroccoBoundScore: vessel.moroccoBoundScore,
          agriCargoScore: vessel.agriCargoScore,
          wheatScore: vessel.commodityScores.wheatScore,
          barleyScore: vessel.commodityScores.barleyScore,
          cornScore: vessel.commodityScores.cornScore,
          soybeanMealScore: vessel.commodityScores.soybeanMealScore,
          mostLikelyCommodity: vessel.mostLikelyCommodity,
          commodityConfidenceLabel: toCommodityConfidenceLabel(vessel.commodityConfidenceLabel),
          detectionPhase: toDetectionPhase(vessel.detectionPhase),
          reasonsJson: {
            moroccoBoundReasons: vessel.moroccoBoundReasons,
            agriCargoReasons: vessel.agriCargoReasons,
            commodityReasons: vessel.commodityReasons,
            provider: input.provider,
            snapshotCapturedAt: new Date().toISOString(),
          },
          scoringReasonsJson: {
            moroccoBoundReasons: vessel.moroccoBoundReasons,
            agriCargoReasons: vessel.agriCargoReasons,
            provider: input.provider,
          },
          commodityReasonsJson: {
            commodityReasons: vessel.commodityReasons,
            provider: input.provider,
          },
        },
      });
    }

    const calls = uniquePortCalls(input.portCalls).filter(
      (call) => vesselIds.has(call.vesselId) && portIds.has(call.portId),
    );
    if (calls.length > 0) {
      await prisma.portCall.createMany({
        data: calls.map((call) => ({
          id: call.id,
          vesselId: call.vesselId,
          portId: call.portId,
          eventType: call.eventType,
          eventTime: new Date(call.eventTime),
        })),
        skipDuplicates: true,
      });
    }

    return { persisted: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown persistence error";
    const errorCode = isDbUnavailableError(error) ? "DB_UNAVAILABLE" : "PERSISTENCE_FAILED";
    return {
      persisted: false,
      error: message,
      errorCode,
    };
  }
}
