import {
  EXPORT_PORT_COMMODITY_KNOWLEDGE,
  MOROCCO_DESTINATION_KNOWLEDGE,
  TERMINAL_COMMODITY_KNOWLEDGE,
  VESSEL_CLASS_KNOWLEDGE,
  ExportCommodityKnowledgeNode,
  MoroccoDestinationKnowledgeProfile,
  TerminalCommodityKnowledgeNode,
  normalizeLooseText,
} from "@/lib/data/live-intelligence-config";
import { getKnowledgeOverrideStore, mergeKnowledgeNodes } from "@/lib/knowledge/overrides";

function exportOriginKey(node: ExportCommodityKnowledgeNode) {
  return node.exportPortId || node.portId || normalizeLooseText(node.portName) || node.id;
}

function terminalKey(node: TerminalCommodityKnowledgeNode) {
  return `${normalizeLooseText(node.portName)}::${normalizeLooseText(node.terminalName)}` || node.id;
}

function moroccoDestinationKey(node: MoroccoDestinationKnowledgeProfile) {
  return node.portId || normalizeLooseText(node.portName) || node.id;
}

function getResolvedKnowledgeCollections() {
  const overrides = getKnowledgeOverrideStore();
  return {
    exportOrigins: mergeKnowledgeNodes(EXPORT_PORT_COMMODITY_KNOWLEDGE, overrides.exportOrigins, exportOriginKey),
    terminals: mergeKnowledgeNodes(TERMINAL_COMMODITY_KNOWLEDGE, overrides.terminals, terminalKey),
    moroccoDestinations: mergeKnowledgeNodes(
      MOROCCO_DESTINATION_KNOWLEDGE,
      overrides.moroccoDestinations,
      moroccoDestinationKey,
    ),
    vesselClasses: VESSEL_CLASS_KNOWLEDGE,
  };
}

function formatCommodityWeights(weights: {
  wheatScore: number;
  barleyScore: number;
  cornScore: number;
  soybeanMealScore: number;
}) {
  return [
    `Wheat ${weights.wheatScore}`,
    `Barley ${weights.barleyScore}`,
    `Corn ${weights.cornScore}`,
    `Soybean meal ${weights.soybeanMealScore}`,
  ].join(" · ");
}

export function getKnowledgeBaseCatalog() {
  const resolved = getResolvedKnowledgeCollections();

  return {
    exportOrigins: resolved.exportOrigins.map((node) => ({
      id: node.id,
      name: node.portName,
      country: node.country,
      region: node.region,
      aliases: node.portAliases,
      corridors: node.likelyCorridors,
      likelyDestinations: node.likelyMoroccoDestinations,
      likelyVesselClasses: node.likelyVesselClasses,
      commodityWeightsLabel: formatCommodityWeights(node.likelyCommodities),
    })),
    terminals: resolved.terminals.map((node) => ({
      id: node.id,
      terminalName: node.terminalName,
      portName: node.portName,
      country: node.country,
      region: node.region,
      terminalType: node.terminalType,
      aliases: node.terminalAliases,
      likelyDestinations: node.likelyMoroccoDestinations,
      commodityWeightsLabel: formatCommodityWeights(node.likelyCommodities),
    })),
    moroccoDestinations: resolved.moroccoDestinations.map((node) => ({
      id: node.id,
      portId: node.portId,
      portName: node.portName,
      aliases: node.aliases,
      grainRelevance: node.grainRelevance,
      feedRelevance: node.feedRelevance,
      likelySourceRegions: node.likelySourceRegions,
      commodityWeightsLabel: formatCommodityWeights(node.likelyImportCommodities),
    })),
    vesselClasses: resolved.vesselClasses.map((node) => ({
      id: node.id,
      label: node.label,
      cargoCompatibility: node.typicalCargoCompatibility,
      moroccoTradeRelevance: node.moroccoTradeRelevance,
      routePatterns: node.typicalRoutePatterns,
      commodityWeightsLabel: formatCommodityWeights(node.commodityBias),
    })),
  };
}

export function getMoroccoDestinationKnowledgeForPort(portName: string) {
  const normalizedPortName = normalizeLooseText(portName);
  const resolved = getResolvedKnowledgeCollections();
  return (
    resolved.moroccoDestinations.find(
      (entry) =>
        normalizeLooseText(entry.portName) === normalizedPortName ||
        entry.aliases.some((alias) => normalizeLooseText(alias) === normalizedPortName),
    ) ?? null
  );
}
