import { getPortOverviews } from "@/lib/radar/service";
import { RadarFeed } from "@/lib/types";

export interface PublicMarketSourceReference {
  id: string;
  label: string;
  publisher: string;
  url: string;
  cadence: string;
  latestReferenceDate: string | null;
  usage: string;
}

export interface MarketContextSignal {
  id: string;
  title: string;
  status: "supportive" | "watch" | "neutral";
  summary: string;
  sourceIds: string[];
}

export interface MarketOriginFlow {
  originCountry: string;
  vesselCount: number;
  highConfidenceCount: number;
  topCommodity: string;
  averageMoroccoBoundScore: number;
  averageAgriCargoScore: number;
}

export interface MarketCommodityPressure {
  commodity: string;
  trackedVessels: number;
  arrivalsNext7Days: number;
  arrivalsNext14Days: number;
  highConfidenceCargoes: number;
  topOrigins: string[];
}

export interface MarketContextDashboardPayload {
  generatedAt: string;
  sourceMode: RadarFeed["source"]["mode"];
  sourceLabel: string;
  summary: {
    trackedVessels: number;
    arrivalsNext7Days: number;
    arrivalsNext14Days: number;
    highConfidenceCargoes: number;
    highConfidenceWheatCargoes: number;
    highConfidenceCornSoymealCargoes: number;
  };
  publicSources: PublicMarketSourceReference[];
  currentSignals: MarketContextSignal[];
  topOriginFlows: MarketOriginFlow[];
  commodityPressure: MarketCommodityPressure[];
  destinationPressure: ReturnType<typeof getPortOverviews>;
  notes: string[];
}

const PUBLIC_SOURCES: PublicMarketSourceReference[] = [
  {
    id: "fao-giews-morocco",
    label: "FAO GIEWS Morocco Country Brief",
    publisher: "FAO",
    url: "https://cb.apps.fao.org/country.jsp?code=MAR",
    cadence: "Periodic country brief",
    latestReferenceDate: "2026-02-02",
    usage: "Track Morocco crop outcomes, import requirements, inflation, and policy support.",
  },
  {
    id: "usda-fas-morocco",
    label: "USDA FAS Morocco Grain and Feed",
    publisher: "USDA FAS",
    url: "https://www.fas.usda.gov/regions/morocco",
    cadence: "GAIN reports",
    latestReferenceDate: null,
    usage: "Cross-check Morocco wheat/barley balances, import demand, and trade policy updates.",
  },
  {
    id: "amis-fao",
    label: "FAO Markets and Trade / AMIS",
    publisher: "FAO",
    url: "https://www.fao.org/markets-and-trade/areas-of-work/global-commodity-markets/en/",
    cadence: "Ongoing market monitoring",
    latestReferenceDate: null,
    usage: "Monitor global grain market balance, policy changes, and benchmark trade context.",
  },
  {
    id: "geoglam-crop-monitor",
    label: "GEOGLAM Crop Monitor",
    publisher: "GEOGLAM",
    url: "https://geoglam.org/ag-monitoring/",
    cadence: "Monthly",
    latestReferenceDate: null,
    usage: "Monitor crop stress and exporter-side production risk for wheat, maize, rice, and soybeans.",
  },
  {
    id: "copernicus-morocco",
    label: "Copernicus CGMS-Maroc use case",
    publisher: "Copernicus",
    url: "https://www.copernicus.eu/en/use-cases/expert-system-crop-monitoring-and-yield-forecasting",
    cadence: "Methodology / reference",
    latestReferenceDate: null,
    usage: "Understand Morocco cereal yield monitoring logic and climate sensitivity.",
  },
  {
    id: "portnet",
    label: "PortNet Single Window",
    publisher: "PortNet",
    url: "https://www.portnet.ma/web/portail-federateur",
    cadence: "Operational portal",
    latestReferenceDate: null,
    usage: "Use Morocco trade single-window and port ecosystem context to reason about import execution.",
  },
];

function formatCommodityLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildOriginFlows(feed: RadarFeed): MarketOriginFlow[] {
  const groups = new Map<
    string,
    {
      vessels: RadarFeed["vessels"];
    }
  >();

  for (const vessel of feed.vessels) {
    const key = vessel.departureCountry || "Unknown";
    const existing = groups.get(key) ?? { vessels: [] };
    existing.vessels.push(vessel);
    groups.set(key, existing);
  }

  return Array.from(groups.entries())
    .map(([originCountry, group]) => {
      const commodityCounts = new Map<string, number>();
      for (const vessel of group.vessels) {
        commodityCounts.set(vessel.mostLikelyCommodity, (commodityCounts.get(vessel.mostLikelyCommodity) ?? 0) + 1);
      }

      const topCommodity =
        Array.from(commodityCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

      return {
        originCountry,
        vesselCount: group.vessels.length,
        highConfidenceCount: group.vessels.filter(
          (vessel) => vessel.moroccoBoundScore >= 70 && vessel.agriCargoScore >= 65,
        ).length,
        topCommodity: formatCommodityLabel(topCommodity),
        averageMoroccoBoundScore: Number(
          (
            group.vessels.reduce((sum, vessel) => sum + vessel.moroccoBoundScore, 0) /
            Math.max(1, group.vessels.length)
          ).toFixed(1),
        ),
        averageAgriCargoScore: Number(
          (
            group.vessels.reduce((sum, vessel) => sum + vessel.agriCargoScore, 0) /
            Math.max(1, group.vessels.length)
          ).toFixed(1),
        ),
      };
    })
    .sort((a, b) => {
      if (b.highConfidenceCount !== a.highConfidenceCount) {
        return b.highConfidenceCount - a.highConfidenceCount;
      }
      return b.vesselCount - a.vesselCount;
    })
    .slice(0, 8);
}

function buildCommodityPressure(feed: RadarFeed): MarketCommodityPressure[] {
  const commodities = ["wheat", "barley", "corn", "soybeanMeal"] as const;

  return commodities
    .map((commodity) => {
      const vessels = feed.vessels.filter((vessel) => vessel.mostLikelyCommodity === commodity);
      const originCounts = new Map<string, number>();
      for (const vessel of vessels) {
        originCounts.set(vessel.departureCountry, (originCounts.get(vessel.departureCountry) ?? 0) + 1);
      }

      return {
        commodity: formatCommodityLabel(commodity),
        trackedVessels: vessels.length,
        arrivalsNext7Days: vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 7).length,
        arrivalsNext14Days: vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 14).length,
        highConfidenceCargoes: vessels.filter(
          (vessel) => vessel.moroccoBoundScore >= 70 && vessel.agriCargoScore >= 65,
        ).length,
        topOrigins: Array.from(originCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([country]) => country),
      };
    })
    .sort((a, b) => b.highConfidenceCargoes - a.highConfidenceCargoes || b.trackedVessels - a.trackedVessels);
}

export function buildMarketContextDashboard(feed: RadarFeed): MarketContextDashboardPayload {
  const arrivalsNext7Days = feed.vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 7).length;
  const arrivalsNext14Days = feed.vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 14).length;
  const highConfidenceCargoes = feed.vessels.filter(
    (vessel) => vessel.moroccoBoundScore >= 70 && vessel.agriCargoScore >= 65,
  ).length;
  const highConfidenceWheatCargoes = feed.vessels.filter(
    (vessel) =>
      vessel.mostLikelyCommodity === "wheat" &&
      vessel.moroccoBoundScore >= 70 &&
      vessel.agriCargoScore >= 65,
  ).length;
  const highConfidenceCornSoymealCargoes = feed.vessels.filter(
    (vessel) =>
      (vessel.mostLikelyCommodity === "corn" || vessel.mostLikelyCommodity === "soybeanMeal") &&
      vessel.moroccoBoundScore >= 70 &&
      vessel.agriCargoScore >= 65,
  ).length;

  const currentSignals: MarketContextSignal[] = [
    {
      id: "import-demand",
      title: "Morocco import demand remains elevated",
      status: "supportive",
      summary:
        "FAO GIEWS indicates above-average cereal imports for marketing year 2025/26 after a below-average 2025 crop, which supports the usefulness of an import radar.",
      sourceIds: ["fao-giews-morocco"],
    },
    {
      id: "policy-support",
      title: "Wheat policy support still matters",
      status: "watch",
      summary:
        "FAO GIEWS notes the wheat import subsidy extension into April 2026, so policy timing should stay part of the trader workflow rather than just the vessel workflow.",
      sourceIds: ["fao-giews-morocco", "usda-fas-morocco"],
    },
    {
      id: "crop-conditions",
      title: "Crop monitoring should stay on the desk",
      status: "neutral",
      summary:
        "GEOGLAM and Copernicus both reinforce that Morocco and major exporters need continuous crop-condition monitoring, not a one-off annual read.",
      sourceIds: ["geoglam-crop-monitor", "copernicus-morocco"],
    },
    {
      id: "port-execution",
      title: "Execution is digitally centralized",
      status: "supportive",
      summary:
        "PortNet confirms Morocco’s foreign-trade process is organized through a national single window, which makes port workflow context a core product layer rather than an optional note.",
      sourceIds: ["portnet"],
    },
  ];

  const notes: string[] = [];
  if (feed.vessels.length === 0) {
    notes.push("No live tracked vessels currently feed the market overlays. The public-source context remains available.");
  }
  if (highConfidenceWheatCargoes > 0) {
    notes.push(`${highConfidenceWheatCargoes} high-confidence wheat cargoes are currently visible in the live radar.`);
  }
  if (highConfidenceCornSoymealCargoes > 0) {
    notes.push(
      `${highConfidenceCornSoymealCargoes} high-confidence corn or soybean-meal cargoes are currently visible in the live radar.`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceMode: feed.source.mode,
    sourceLabel: feed.source.label,
    summary: {
      trackedVessels: feed.vessels.length,
      arrivalsNext7Days,
      arrivalsNext14Days,
      highConfidenceCargoes,
      highConfidenceWheatCargoes,
      highConfidenceCornSoymealCargoes,
    },
    publicSources: PUBLIC_SOURCES,
    currentSignals,
    topOriginFlows: buildOriginFlows(feed),
    commodityPressure: buildCommodityPressure(feed),
    destinationPressure: getPortOverviews(feed.vessels),
    notes,
  };
}
