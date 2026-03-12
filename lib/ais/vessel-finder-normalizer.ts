import { PortRecord, LatestPosition, VesselRecord, VoyageRecord } from "@/lib/types";

const UNKNOWN_PORT_ID = "live-port-unknown";
const UNKNOWN_PORT_CODE = "LIVUNK";

interface VesselFinderContext {
  knownPortsByCode: Map<string, PortRecord>;
  knownPortsByName: Map<string, PortRecord>;
  registerDynamicPort: (port: PortRecord) => PortRecord;
  queryPort: PortRecord;
  now: Date;
}

export interface NormalizedVesselFinderRecord {
  vessel: VesselRecord;
  voyage: VoyageRecord;
  position: LatestPosition;
  historicalRoutePortIds: string[];
}

function clean(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function parseDateToIso(raw: unknown, fallback: Date) {
  if (raw === null || raw === undefined || raw === "") {
    return fallback.toISOString();
  }

  if (typeof raw === "number") {
    const date = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
    return fallback.toISOString();
  }

  if (typeof raw !== "string") {
    return fallback.toISOString();
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback.toISOString();
  }

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  const normalized = trimmed.replace(" ", "T");
  const withTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const patched = new Date(withTimezone);
  if (!Number.isNaN(patched.getTime())) {
    return patched.toISOString();
  }

  return fallback.toISOString();
}

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "unknown";
}

function toPortLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toTypeFromAisCode(code: number) {
  if (code >= 70 && code <= 79) {
    return "Cargo";
  }

  if (code >= 80 && code <= 89) {
    return "Tanker";
  }

  if (code >= 60 && code <= 69) {
    return "Passenger";
  }

  if (code >= 30 && code <= 39) {
    return "Fishing / Service";
  }

  return "Unknown";
}

function inferVesselType(ais: Record<string, unknown>, master: Record<string, unknown>) {
  const preferred = clean(master.TYPE_SUMMARY || master.TYPE || ais.TYPE_SUMMARY || ais.TYPE_TEXT || ais.TYPE);
  if (preferred) {
    return preferred;
  }

  const aisTypeCode = toNumber(ais.TYPE, NaN);
  if (Number.isFinite(aisTypeCode)) {
    return toTypeFromAisCode(aisTypeCode);
  }

  return "Unknown";
}

function resolveKnownPort(code: string, name: string, context: VesselFinderContext) {
  const normalizedCode = code.toUpperCase();
  if (normalizedCode) {
    const byCode = context.knownPortsByCode.get(normalizedCode);
    if (byCode) {
      return byCode;
    }
  }

  const normalizedName = toPortLookupKey(name);
  if (normalizedName) {
    const byName = context.knownPortsByName.get(normalizedName);
    if (byName) {
      return byName;
    }
  }

  return null;
}

function ensurePort(params: {
  code: string;
  name: string;
  country: string;
  context: VesselFinderContext;
  fallbackLat: number;
  fallbackLon: number;
  isMoroccoDestination?: boolean;
}) {
  const code = params.code.toUpperCase();
  const name = params.name || "Unknown";
  const country = params.country || "Unknown";

  const known = resolveKnownPort(code, name, params.context);
  if (known) {
    return known;
  }

  if (!code && !name) {
    return params.context.knownPortsByCode.get(UNKNOWN_PORT_CODE) ?? params.context.queryPort;
  }

  const idBase = code || `${country}-${name}`;
  const id = `live-port-${slug(idBase)}`;
  const generatedCode = code || `LIVE-${slug(name).slice(0, 6).toUpperCase()}`;
  const isMoroccoDestination =
    params.isMoroccoDestination ?? /morocco|casablanca|jorf|agadir|tanger|nador|safi/i.test(name);

  const dynamic: PortRecord = {
    id,
    name,
    country,
    code: generatedCode,
    lat: params.fallbackLat,
    lon: params.fallbackLon,
    isMoroccoDestination,
    isLikelyGrainOrigin: false,
  };

  return params.context.registerDynamicPort(dynamic);
}

function buildVesselId(imo: string, mmsi: string, name: string) {
  if (imo) {
    return `vf-imo-${imo}`;
  }

  if (mmsi) {
    return `vf-mmsi-${mmsi}`;
  }

  return `vf-name-${slug(name)}`;
}

function cappedHours(value: number) {
  return Number(Math.max(0, Math.min(720, value)).toFixed(1));
}

function normalizeEta(rawEta: unknown, now: Date) {
  const parsed = parseDateToIso(rawEta, new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
  const date = new Date(parsed);
  if (date.getTime() < now.getTime() - 12 * 60 * 60 * 1000) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  return parsed;
}

function pickFirst(...values: unknown[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function ensureUnknownPort(context: VesselFinderContext) {
  const existing = context.knownPortsByCode.get(UNKNOWN_PORT_CODE);
  if (existing) {
    return existing;
  }

  return context.registerDynamicPort({
    id: UNKNOWN_PORT_ID,
    name: "Unknown Port",
    country: "Unknown",
    code: UNKNOWN_PORT_CODE,
    lat: context.queryPort.lat,
    lon: context.queryPort.lon,
    isMoroccoDestination: false,
    isLikelyGrainOrigin: false,
  });
}

export function extractRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((record): record is Record<string, unknown> => Boolean(record && typeof record === "object"));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as Record<string, unknown>;
  const list = candidate.data ?? candidate.DATA ?? candidate.result ?? candidate.RESULT ?? candidate.items;
  if (Array.isArray(list)) {
    return list.filter((record): record is Record<string, unknown> => Boolean(record && typeof record === "object"));
  }

  return [];
}

export function normalizeExpectedArrivalRecord(
  record: Record<string, unknown>,
  context: VesselFinderContext,
): NormalizedVesselFinderRecord | null {
  const ais = (record.AIS ?? record.ais ?? record) as Record<string, unknown>;
  const voyageRaw = (record.VOYAGE ?? record.voyage ?? {}) as Record<string, unknown>;
  const master = (record.MASTER ?? record.master ?? {}) as Record<string, unknown>;

  const name = pickFirst(ais.NAME, master.NAME, record.NAME, "Unknown vessel");
  const imo = pickFirst(ais.IMO, master.IMO);
  const mmsi = pickFirst(ais.MMSI, record.MMSI);
  const vesselId = buildVesselId(imo, mmsi, name);

  const latitude = toNumber(ais.LATITUDE, toNumber(record.LATITUDE, context.queryPort.lat));
  const longitude = toNumber(ais.LONGITUDE, toNumber(record.LONGITUDE, context.queryPort.lon));
  const speed = toNumber(ais.SPEED, 0);
  const course = toNumber(ais.COURSE, 0);
  const heading = toNumber(ais.HEADING, course);
  const lastSignalAt = parseDateToIso(ais.TIMESTAMP ?? record.TIMESTAMP, context.now);

  const destinationText = pickFirst(
    ais.DESTINATION,
    voyageRaw.DESTINATION,
    context.queryPort.name,
  );
  const eta = normalizeEta(ais.ETA ?? voyageRaw.ETA_AIS ?? voyageRaw.ETA, context.now);

  const departureIso = parseDateToIso(
    voyageRaw.DEPARTURE ?? voyageRaw.LASTDEPARTURE ?? record.DEPARTURE,
    new Date(context.now.getTime() - 12 * 60 * 60 * 1000),
  );
  const arrivalIso = parseDateToIso(
    voyageRaw.ARRIVAL ?? voyageRaw.LASTARRIVAL ?? record.ARRIVAL,
    new Date(context.now.getTime() - 36 * 60 * 60 * 1000),
  );
  const departureTime = new Date(departureIso);
  const arrivalTime = new Date(arrivalIso);
  const timeSinceDepartureHours = cappedHours(
    (context.now.getTime() - departureTime.getTime()) / (60 * 60 * 1000),
  );

  const previousPort = ensurePort({
    code: pickFirst(voyageRaw.LASTPORTLOCODE, voyageRaw.LASTPORTUNLOCODE, voyageRaw.LASTPORTCODE),
    name: pickFirst(voyageRaw.LASTPORT, voyageRaw.DEPARTURE, "Unknown Port"),
    country: pickFirst(voyageRaw.LASTPORTCOUNTRY, voyageRaw.DEPARTURECOUNTRY, "Unknown"),
    context,
    fallbackLat: latitude,
    fallbackLon: longitude,
  });

  const departurePort = ensurePort({
    code: pickFirst(voyageRaw.DEPARTURELOCODE, voyageRaw.DEPARTUREUNLOCODE, voyageRaw.DEPARTURECODE),
    name: pickFirst(voyageRaw.DEPARTURE, voyageRaw.LASTPORT, previousPort.name),
    country: pickFirst(voyageRaw.DEPARTURECOUNTRY, voyageRaw.LASTPORTCOUNTRY, previousPort.country),
    context,
    fallbackLat: previousPort.lat,
    fallbackLon: previousPort.lon,
  });

  const destinationPortCode = pickFirst(
    ais.DESTINATIONLOCODE,
    ais.DESTINATIONCODE,
    voyageRaw.DESTINATIONLOCODE,
    context.queryPort.code,
  );
  const destinationPortName = pickFirst(ais.DESTINATIONPORT, context.queryPort.name);
  const destinationPortCountry = pickFirst(ais.DESTINATIONCOUNTRY, context.queryPort.country, "Morocco");
  const destinationPort = ensurePort({
    code: destinationPortCode,
    name: destinationPortName,
    country: destinationPortCountry,
    context,
    fallbackLat: context.queryPort.lat,
    fallbackLon: context.queryPort.lon,
    isMoroccoDestination: context.queryPort.isMoroccoDestination,
  });

  const safePreviousPort = previousPort || ensureUnknownPort(context);
  const safeDeparturePort = departurePort || safePreviousPort;
  const safeDestinationPort = destinationPort || context.queryPort;

  const deadweight = toNumber(master.DWT ?? ais.DWT, 0);
  const lastDraft = toNumber(master.DRAUGHT ?? ais.DRAUGHT ?? ais.DRAFT, 0);
  const length = toNumber(master.LENGTH, 0);
  const width = toNumber(master.WIDTH, 0);
  const arrivalDraftValue = toNumber(
    voyageRaw.ARRIVAL_DRAFT ?? voyageRaw.ARRIVALDRAUGHT ?? ais.ARRIVAL_DRAFT,
    Number.NaN,
  );
  const departureDraftValue = toNumber(
    voyageRaw.DEPARTURE_DRAFT ?? voyageRaw.DEPARTUREDRAUGHT ?? ais.DRAUGHT ?? ais.DRAFT,
    Number.NaN,
  );
  const portStayHoursValue = toNumber(
    voyageRaw.PORT_STAY_HOURS ?? voyageRaw.PORTSTAYHOURS ?? voyageRaw.STAYHOURS,
    Number.NaN,
  );
  const derivedPortStayHours =
    departureTime.getTime() >= arrivalTime.getTime()
      ? Number(((departureTime.getTime() - arrivalTime.getTime()) / 3_600_000).toFixed(1))
      : Number.NaN;

  const vessel: VesselRecord = {
    id: vesselId,
    imo: imo || `NA-${vesselId}`,
    mmsi: mmsi || `NA-${vesselId}`,
    name,
    vesselType: inferVesselType(ais, master),
    flag: pickFirst(master.FLAG, ais.FLAG, "Unknown"),
    deadweight,
    length,
    width,
    lastDraft,
  };

  const voyage: VoyageRecord = {
    id: `vf-voy-${vesselId}`,
    vesselId,
    currentLat: latitude,
    currentLon: longitude,
    speed,
    course,
    heading,
    destinationText,
    destinationPortId: safeDestinationPort.id,
    eta,
    previousPortId: safePreviousPort.id,
    departurePortId: safeDeparturePort.id,
    departureDetectedAt: departureIso,
    timeSinceDepartureHours,
    originCountry: safeDeparturePort.country,
    lastSignalAt,
    arrivalDraft: Number.isFinite(arrivalDraftValue) ? arrivalDraftValue : null,
    departureDraft: Number.isFinite(departureDraftValue) ? departureDraftValue : lastDraft,
    portStayHours: Number.isFinite(portStayHoursValue)
      ? portStayHoursValue
      : Number.isFinite(derivedPortStayHours)
        ? derivedPortStayHours
        : null,
    loadingTerminalHint: pickFirst(
      voyageRaw.DEPARTURETERMINAL,
      voyageRaw.DEP_TERMINAL,
      voyageRaw.LOADING_TERMINAL,
      safeDeparturePort.name,
    ),
    arrivalAt: arrivalIso,
    departureAt: departureIso,
  };

  const position: LatestPosition = {
    vesselId,
    lat: latitude,
    lon: longitude,
    speed,
    course,
    heading,
    timestamp: lastSignalAt,
  };

  const historicalRoutePortIds = [
    safeDeparturePort.id,
    safePreviousPort.id,
    safeDestinationPort.id,
  ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

  return {
    vessel,
    voyage,
    position,
    historicalRoutePortIds,
  };
}

function toPortCallEventType(rawEvent: string) {
  const value = rawEvent.toLowerCase();
  if (value.includes("depart")) {
    return "DEPARTURE" as const;
  }
  if (value.includes("anchor")) {
    return "ANCHORED" as const;
  }
  if (value.includes("berth")) {
    return "BERTHED" as const;
  }
  return "ARRIVAL" as const;
}

export function normalizePortCallRecord(params: {
  record: Record<string, unknown>;
  port: PortRecord;
  now: Date;
}) {
  const data = params.record;
  const ais = (data.AIS ?? data.ais ?? data) as Record<string, unknown>;

  const name = pickFirst(ais.NAME, data.NAME, "Unknown vessel");
  const imo = pickFirst(ais.IMO, data.IMO);
  const mmsi = pickFirst(ais.MMSI, data.MMSI);
  const vesselId = buildVesselId(imo, mmsi, name);
  const event = pickFirst(data.EVENT, data.TYPE, data.MOVEMENT, "ARRIVAL");
  const eventTime = parseDateToIso(data.TIMESTAMP ?? data.EVENTTIME ?? data.TIME, params.now);

  return {
    id: `vf-portcall-${params.port.code}-${vesselId}-${new Date(eventTime).getTime()}`,
    vesselId,
    portId: params.port.id,
    eventType: toPortCallEventType(event),
    eventTime,
  };
}
