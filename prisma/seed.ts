import {
  CommodityHypothesisConfidence,
  ConfidenceLevel,
  PrismaClient,
} from "@prisma/client";
import { buildMockDataset } from "@/lib/data/mock-dataset";
import { scoreVesselIntelligence } from "@/lib/scoring/grain-scoring";

const prisma = new PrismaClient();

const confidenceMap: Record<"High" | "Medium" | "Low", ConfidenceLevel> = {
  High: "HIGH",
  Medium: "MEDIUM",
  Low: "LOW",
};

const commodityConfidenceMap: Record<
  "weak hypothesis" | "moderate hypothesis" | "strong hypothesis",
  CommodityHypothesisConfidence
> = {
  "weak hypothesis": "WEAK",
  "moderate hypothesis": "MODERATE",
  "strong hypothesis": "STRONG",
};

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const toRad = (degree: number) => (degree * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(value));
}

function inferMaritimeZone(lat: number, lon: number) {
  if (lat >= 34.8 && lat <= 36.8 && lon >= -6.8 && lon <= -3.5) {
    return "Gibraltar Strait";
  }

  if (lat >= 26 && lat <= 39 && lon >= -19 && lon <= -5) {
    return "Atlantic Morocco Corridor";
  }

  if (lat >= 30 && lat <= 46 && lon >= -2 && lon <= 30) {
    return "Western Mediterranean";
  }

  if (lat >= 15 && lat <= 45 && lon >= -55 && lon < -19) {
    return "North Atlantic Transit";
  }

  return "Open Ocean Transit";
}

function inferDestinationRegion(destinationName: string, destinationCountry: string) {
  if (destinationCountry === "Morocco") {
    if (destinationName === "Tanger Med" || destinationName === "Nador") {
      return "Morocco Mediterranean";
    }

    return "Morocco Atlantic";
  }

  if (destinationCountry === "Spain" || destinationCountry === "France") {
    return "Western Europe / Iberia";
  }

  return "Unknown / open routing";
}

async function main() {
  const dataset = buildMockDataset();
  const portById = new Map(dataset.ports.map((port) => [port.id, port]));
  const moroccoPorts = dataset.ports.filter((port) => port.isMoroccoDestination);

  await prisma.grainAssessment.deleteMany();
  await prisma.portCall.deleteMany();
  await prisma.voyage.deleteMany();
  await prisma.vessel.deleteMany();
  await prisma.port.deleteMany();

  await prisma.port.createMany({ data: dataset.ports });
  await prisma.vessel.createMany({ data: dataset.vessels });

  const intelligenceByVessel = new Map<string, ReturnType<typeof scoreVesselIntelligence>>();

  const voyageRows = dataset.voyages.map((voyage) => {
    const vessel = dataset.vessels.find((item) => item.id === voyage.vesselId);
    if (!vessel) {
      throw new Error(`Missing vessel for voyage ${voyage.id}`);
    }

    const departurePort = portById.get(voyage.departurePortId);
    const destinationPort = portById.get(voyage.destinationPortId);

    const nearest = moroccoPorts
      .map((port) => ({
        name: port.name,
        distanceKm: haversineDistanceKm(voyage.currentLat, voyage.currentLon, port.lat, port.lon),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];

    const effectiveSpeed = voyage.speed > 3 ? voyage.speed : 10;
    const estimatedDaysToMorocco = Number((nearest.distanceKm / (effectiveSpeed * 1.852 * 24)).toFixed(1));
    const currentMaritimeZone = inferMaritimeZone(voyage.currentLat, voyage.currentLon);

    const scoring = scoreVesselIntelligence({
      vesselType: vessel.vesselType,
      departurePort,
      destinationPort,
      destinationText: voyage.destinationText,
      currentLat: voyage.currentLat,
      currentLon: voyage.currentLon,
      speed: voyage.speed,
      course: voyage.course,
      deadweight: vessel.deadweight,
      lastDraft: vessel.lastDraft,
      historicalRoutePortIds: dataset.historicalRoutesByVessel[vessel.id] ?? [],
      estimatedDaysToMorocco,
      currentMaritimeZone,
      timeSinceDepartureHours: voyage.timeSinceDepartureHours,
    });

    intelligenceByVessel.set(vessel.id, scoring);

    return {
      ...voyage,
      eta: new Date(voyage.eta),
      departureDetectedAt: new Date(voyage.departureDetectedAt),
      lastSignalAt: new Date(voyage.lastSignalAt),
      estimatedDaysToMorocco,
      currentMaritimeZone,
      suspectedDestinationRegion: inferDestinationRegion(
        destinationPort?.name ?? "Unknown",
        destinationPort?.country ?? "Unknown",
      ),
      detectionPhase: scoring.detectionPhase,
    };
  });

  await prisma.voyage.createMany({ data: voyageRows });

  await prisma.portCall.createMany({
    data: dataset.portCalls.map((portCall) => ({
      ...portCall,
      eventTime: new Date(portCall.eventTime),
    })),
  });

  const assessments = dataset.vessels.map((vessel) => {
    const scoring = intelligenceByVessel.get(vessel.id);
    if (!scoring) {
      throw new Error(`Missing intelligence scoring for vessel ${vessel.id}`);
    }

    return {
      id: `ga-${vessel.id}`,
      vesselId: vessel.id,
      score: scoring.moroccoBoundScore,
      confidenceLevel: confidenceMap[scoring.confidenceLevel],
      moroccoBoundScore: scoring.moroccoBoundScore,
      agriCargoScore: scoring.agriCargoScore,
      wheatScore: scoring.commodityScores.wheatScore,
      barleyScore: scoring.commodityScores.barleyScore,
      cornScore: scoring.commodityScores.cornScore,
      soybeanMealScore: scoring.commodityScores.soybeanMealScore,
      mostLikelyCommodity: scoring.mostLikelyCommodity,
      commodityConfidenceLabel: commodityConfidenceMap[scoring.commodityConfidenceLabel],
      detectionPhase: scoring.detectionPhase,
      reasonsJson: scoring.moroccoBoundReasons,
      scoringReasonsJson: {
        moroccoBoundReasons: scoring.moroccoBoundReasons,
        agriCargoReasons: scoring.agriCargoReasons,
      },
      commodityReasonsJson: scoring.commodityReasons,
      updatedAt: new Date(),
      createdAt: new Date(),
    };
  });

  await prisma.grainAssessment.createMany({ data: assessments });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
