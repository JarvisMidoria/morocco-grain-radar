# Morocco Grain Radar

Morocco Grain Radar is a maritime intelligence dashboard for agri-food brokers.

It prioritizes **early detection from departure ports** and provides explainable multi-layer hypotheses:

1. Morocco-bound likelihood
2. Agri-cargo likelihood
3. Commodity hypothesis (wheat, barley, corn, soybean meal)

The system is probabilistic by design and does not claim cargo certainty.

## Stack

- Next.js 14 (App Router)
- TypeScript
- TailwindCSS + shadcn/ui-style components
- Prisma + PostgreSQL schema
- Leaflet (live map)
- Recharts (analytics)

## What’s Implemented

- Upgraded detection pipeline centered on departure intelligence
- Detection phases:
  - `departure_detected`
  - `morocco_bound_suspected`
  - `morocco_bound_likely`
  - `agri_cargo_likely`
  - `commodity_hypothesis`
  - `near_arrival_confirmed`
- Multi-layer explainable scoring:
  - `moroccoBoundScore`
  - `agriCargoScore`
  - `commodityScores` (`wheat`, `barley`, `corn`, `soybeanMeal`)
  - voyage hypothesis layer (`topVoyageHypothesis`, alternatives, confirmation gaps)
  - `mostLikelyCommodity`
  - `commodityConfidenceLabel`
- Dashboard upgrades:
  - KPI cards for early-detection stages
  - **Early Detected Candidates** table
  - upgraded tracked vessel table
  - advanced filters (phase, departure, maritime zone, commodity, confidence, recent-only, high-agri-only)
- Live map upgrades:
  - map mode toggles (`all`, `early-detected`, `approaching Morocco`, `agri-cargo likely`)
  - origin-to-corridor hypothesis route rendering
- Vessel detail upgrades:
  - departure intelligence sheet
  - Morocco-bound reasoning
  - agri-cargo reasoning
  - commodity hypothesis breakdown
  - routing history + mini map
- Ports page upgrades:
  - early-detected likely targeting each Morocco port
  - top origin ports per Morocco port
  - top commodity hypotheses per Morocco port
  - average estimated days to arrival
- Analytics upgrades:
  - top recent departure ports
  - top departure countries
  - vessels by detection phase
  - average days to Morocco by phase
  - commodity distribution
  - Morocco-bound by corridor
  - agri score distribution

## AIS Provider Abstraction

Provider interface (`lib/ais/provider.ts`) exposes:

- `getExpectedArrivals(port)`
- `getPortCalls(port)`
- `getVesselDetails(vesselId)`
- `getLatestPositions(vesselIds)`
- `getVoyageData(vesselIds)`

Implemented providers:

- `MockAISProvider` (stable default)
- `HybridAISProvider` (`AIS_PROVIDER=hybrid`, AISStream detection + Datalastic enrichment)
- `VesselFinderProvider` (live integration implemented)
- `MarineTrafficProvider` (kept as stub)

## Runtime Modes

### 1. Mock mode (default)

```env
RADAR_DATA_MODE=mock
```

Uses the existing mock AIS pipeline and simulated live movement.

### 2. Live mode (real AIS)

```env
RADAR_DATA_MODE=live
AIS_PROVIDER=hybrid
AISSTREAM_API_KEY=your_key
DATALASTIC_API_KEY=your_key
GFW_API_TOKEN=your_token
```

The radar still uses the same scoring engine and UI, but vessel data is fetched from a live provider and normalized into the internal model.

## Deploy on the Web

For this project, use a **Node always-on host** (recommended: **Render** or **Railway**).

Why:
- live ingestion + rolling memory/watchlist work better on always-on runtimes
- serverless-only hosting can cold-start often and reduce tracking continuity

Netlify can run the app, but is not recommended for the live radar path.

### Option A: Render (recommended)

This repo includes a ready blueprint file: `render.yaml`.

1. Push repo to GitHub.
2. Create a PostgreSQL database (Render Postgres, Neon, Supabase, Railway Postgres, etc.).
3. In Render, create a new Blueprint from the repo.
4. Set secret env vars in Render:
   - `DATABASE_URL`
   - `AISSTREAM_API_KEY`
   - `DATALASTIC_API_KEY`
   - `GFW_API_TOKEN` (optional but recommended)
5. Deploy.

Render uses:
- Build: `npm ci && npm run build`
- Start: `npm run start:render`
- Healthcheck: `/api/health`

### Option B: Railway

This repo includes `railway.toml`.

1. Push repo to GitHub.
2. Create a new Railway project from the repo.
3. Attach a PostgreSQL service and set `DATABASE_URL`.
4. Set runtime env vars:
   - `RADAR_DATA_MODE=live`
   - `AIS_PROVIDER=hybrid`
   - `AISSTREAM_API_KEY`
   - `DATALASTIC_API_KEY`
   - `GFW_API_TOKEN` (optional)
5. Deploy.

### Required Environment Variables (Live)

- `DATABASE_URL`
- `RADAR_DATA_MODE=live`
- `AIS_PROVIDER=hybrid`
- `AISSTREAM_API_KEY`
- `DATALASTIC_API_KEY`
- `GFW_API_TOKEN` (optional, supplementary historical enrichment)

### Health + Smoke Checks

After deploy:
- `/api/health`
- `/api/live-vessels`
- `/api/live-vessels?debug=1`

## Live Integration Scope (Current)

The live integration is intentionally minimal and constrained for safe rollout.

Implemented in live mode:
- **Hybrid mode (`AIS_PROVIDER=hybrid`)**
  - AISStream websocket detection on seeded export-to-Morocco corridors (not global)
  - Datalastic enrichment for detected MMSI (`vessel_pro`, `vessel_info`, `port_find`)
  - Global Fishing Watch supplementary historical enrichment (`/v3/events`, `/v2/events`, `/v3/events/search`)
  - normalized vessel/voyage/position fields passed to existing scoring pipeline
- **VesselFinder mode (`AIS_PROVIDER=vesselfinder`)**
  - destination-scoped ingestion for Morocco destination ports
  - expected arrivals + vessel/voyage/position normalization
  - optional recent port calls fetch (best-effort)

Not yet implemented in live mode:
- full global ingestion (worldwide scan)
- MarineTraffic live provider implementation

GFW integration is supportive only:
- AISStream remains the primary live detection source.
- GFW is used for historical route/port-visit evidence only.
- If `GFW_API_TOKEN` is missing or GFW fails (auth/rate-limit/payload), the radar continues normally without GFW evidence.

## Live Validation / Debug

Use the existing endpoint with an optional debug flag:

```bash
/api/live-vessels?debug=1
```

For rolling live evaluation windows, use:

```bash
/api/live-vessels?evaluation=1&windowHours=24
/api/live-vessels?evaluation=1&windowHours=48
/api/live-vessels?evaluation=1&windowHours=72
```

or run the CLI report:

```bash
npm run live:evaluate -- --window=48
npm run live:evaluate -- --window=72 --json
```

When `debug=1`, the response includes per-vessel validation fields:
- raw + normalized destination text
- raw + normalized vessel type
- normalized vessel class (`bulk_carrier`, `general_cargo`, `dry_cargo_other`, excluded classes)
- raw + normalized ETA
- raw + normalized draft
- raw departure/previous port fields
- inferred departure port + confidence + inference reason
- corridor classification + corridor relevance
- acquisition decision (`selected` vs `rejected`) + acquisition reasons
- enrichment attempted/skipped + skip reason
- GFW diagnostics (`gfwEnrichmentAttempted`, `gfwEnrichmentSuccess`, `gfwEndpointUsed`, `gfwHistoricalPortMatches`, `gfwMoroccoVisitCount`, `gfwExportPortVisitCount`, `gfwHistoricalRouteHints`, `gfwEvidenceConfidence`, `gfwReasons`)
- operational diagnostics (`operationalSupportScore`, `portCongestionSignal`, `berthProximitySignal`, `waitingPatternSignal`, `loadingQueuePlausibility`, `operationalEvidenceConfidence`, `operationalReasons`, `repeatedObservedNearSeededExportArea`, `lowSpeedDurationNearSeededPortHours`, `relevantNearbyVesselCount`)
- admission decision (`included` vs `excluded`) + exclusion reasons + admission score
- Morocco/export relevance flags
- scoring reasons (Morocco-bound + agri-cargo)
- loading signal reasons
- loading-event diagnostics (`loadingSignalScore`, `draftDelta`, `portStayHours`, `loadingTerminalMatch`, `loadingConfidence`)
- voyage-hypothesis diagnostics (`topVoyageHypothesis`, `topVoyageHypothesisScore`, `topVoyageHypothesisConfidence`, `voyageHypothesisEvidenceStyle`, `alternativeVoyageHypotheses`, `missingSignalsForVoyageConfirmation`)
- rolling-memory diagnostics (`firstSeenAt`, `lastSeenAt`, `observationCount`, historical sample counts, score/loading trends, rolling retention reason)
- watchlist lifecycle diagnostics (`watchlistDecision`, `watchlistReasons`, `watchlistEnteredAt`, `watchlistLastUpdatedAt`, `watchlistRetentionRemainingHours`, `reEnrichmentCount`, `promotionEligible`, `promotionReason`, `dropReason`)
- commodity hypothesis reasons

It also includes lightweight live-data quality metrics:
- `liveVesselsRetrieved`
- `admittedToRadar`
- `excludedFromRadar`
- `withDestinationText`
- `withNormalizedMoroccoDestination`
- `withDeparturePortInferred`
- `withDraftPresent`
- `withEtaPresent`
- `withWeakEvidenceOnly`

And acquisition-stage aggregate metrics:
- `rawStreamDetections`
- `screenedDetections`
- `dryBulkCompatibleDetections`
- `corridorRelevantDetections`
- `exportPortRelevantDetections`
- `moroccoRelevantDetections`
- `enrichedCandidates`
- `admittedCandidates`
- `gfwEnrichmentAttemptedCount`
- `gfwEnrichmentSuccessCount`
- `gfwVesselsWithExportHistory`
- `gfwVesselsWithMoroccoHistory`
- `gfwVesselsWithRouteHints`
- `gfwVesselsWithSupportiveEvidence`

And rolling-window aggregate metrics:
- `rollingWindowHours`
- `vesselsTrackedInMemory`
- `vesselsRetainedInRollingWindow`
- `vesselsUpdatedMultipleTimes`
- `vesselsWithUsableDraftHistory`
- `vesselsWithUsableLoadingTrend`
- `vesselsConfidenceImprovedOverTime`

And candidate-watchlist aggregate metrics:
- `vesselsAcquired`
- `vesselsInWatchlist`
- `vesselsEnrichedFromWatchlist`
- `vesselsPromotedToRadar`
- `vesselsDroppedFromWatchlist`
- `averageWatchlistDurationHours`
- `vesselsImprovedOverTimeWhileInWatchlist`

When `evaluation=1`, the response includes rolling-window evaluation outputs:
- totals:
  - `totalRawDetections`
  - `dryBulkCompatibleDetections`
  - `watchlistEntries`
  - `reEnrichments`
  - `promotedVessels`
  - `admittedRadarVessels`
  - `excludedVesselsByReason`
  - `vesselsWithExportKnowledgeMatch`
  - `vesselsWithTerminalMatch`
  - `vesselsWithDestinationIntelligence`
  - `vesselsWithUsableLoadingEvidence`
  - `vesselsWithImprovingEvidenceOverTime`
  - `vesselsImprovedByGfwHistoricalEvidence`
  - `vesselsWithRepeatedExportPatternViaGfw`
  - `vesselsWithRepeatedMoroccoPatternViaGfw`
  - `vesselsImprovedByOperationalSignals`
  - `operationalSignalsHelpedWatchlistPriorityCount`
  - `operationalSignalsHelpedPromotionReadinessCount`
- ranked outputs:
  - `topWatchlistCandidates`
  - `topPromotedOrAdmittedVessels`
  - `topBlockersPreventingPromotion`
  - `topMissingAliasOrTerminalGaps`
  - `topKnowledgeImpactCases`
  - `topVoyageHypothesesObserved`
  - `voyageHypothesesImprovedOverTime`
  - `vesselsWithClearerInterpretationFromVoyageHypothesis`
  - `mostCommonMissingSignalsForVoyageConfirmation`
  - `gfwClarifiedVoyageHypothesisCases`
  - `portsWithWaitingOrCongestionPatterns`
  - `departuresMadeMeaningfulAfterWaiting`

Main radar tables/maps use only `included` admissions; excluded live detections stay visible only in debug payload.

## Live Candidate Admission (Hybrid)

Hybrid live mode now applies a strict pre-scoring admission gate.

Excluded vessel classes:
- `excluded_container`
- `excluded_tanker`
- `excluded_tug`
- `excluded_inland`
- `excluded_local`
- `excluded_passenger`
- `excluded_other` (ro-ro/fishing/service/support and unsupported classes)

Primary corridor classes:
- `western_europe_to_morocco_atlantic`
- `black_sea_to_morocco_via_bosphorus_and_med`
- `us_gulf_to_morocco_atlantic`
- `south_atlantic_agri_to_morocco`
- `gibraltar_approach_to_morocco`
- `western_mediterranean_to_morocco`

Hard-irrelevant classes:
- `irrelevant_pacific_oceania`
- `irrelevant_inland_europe`
- `irrelevant_other`

Admission requires a dry-bulk-compatible class, relevant corridor, Morocco/export evidence, and operational voyage relevance.

Seeded export-port intelligence (initial set):
- Western Europe: Rouen, La Rochelle, Dunkerque, Nantes Saint-Nazaire
- Black Sea/Eastern Europe: Odessa, Chornomorsk, Pivdennyi (Yuzhny variants), Constanta, Varna, Novorossiysk
- Americas: New Orleans, Houston, Rosario, Santos
- Canada: Vancouver, Thunder Bay

Note: live scoring is intentionally damped when multiple critical fields are missing (sparse data guard).

## Cost-Efficient Live Ingestion (API Usage Controls)

Live mode now uses a cost-first strategy:

- watchlist-based tracking for shortlisted vessels
- aggressive caching at provider + radar service levels
- slow default refresh for non-shortlisted traffic
- faster refresh only for shortlist-related Morocco destination ports
- Morocco destination filtering (no global scan)
- selected export-port and dry-cargo prioritization (bulk/general cargo lanes first)
- optional port-calls fetch (disabled by default)
- explicit usage logs for every real provider call (`[RadarUsage] ...`)

Key behavior:

- `expectedarrivals` is the main live call path.
- In low usage profile, live scans are restricted to a subset of Morocco ports (`Casablanca`, `Jorf Lasfar`, `Agadir`).
- In medium profile, all configured Morocco destination ports are scanned.
- Non-priority vessels are filtered early in normalization to reduce downstream noise and refresh pressure.

## Environment Variables

Required:
- `DATABASE_URL` (PostgreSQL)
- `RADAR_DATA_MODE` = `mock` or `live`
- `AIS_PROVIDER` = `hybrid` or `vesselfinder` when `RADAR_DATA_MODE=live`
- `AISSTREAM_API_KEY` + `DATALASTIC_API_KEY` for `AIS_PROVIDER=hybrid`
- `VESSELFINDER_API_KEY` for `AIS_PROVIDER=vesselfinder`

Optional live tuning:
- `RADAR_LIVE_USAGE_PROFILE` = `low` (default) or `medium`
- `RADAR_LOG_API_USAGE` = `true`/`false` (default `true`)
- `AISSTREAM_CONNECT_TIMEOUT_SECONDS` (default: `75`)
- `AISSTREAM_COLLECTION_SECONDS` (default: `12`)
- `AISSTREAM_MAX_DETECTIONS` (default: `30`)
- `HYBRID_MAX_ENRICHMENTS` (default: `40`)
- `HYBRID_ENRICH_BATCH_SIZE` (default: `6`)
- `HYBRID_CACHE_TTL_SECONDS` (default: `900`)
- `DATALASTIC_REQUEST_TIMEOUT_MS` (default: `12000`)
- `VESSELFINDER_API_BASE_URL` (default: `https://api.vesselfinder.com`)
- `VESSELFINDER_EXPECTED_ARRIVALS_LIMIT` (default: `150`)
- `VESSELFINDER_EXPECTED_ARRIVALS_INTERVAL_MINUTES` (default: `14400`)
- `VESSELFINDER_SLOW_REFRESH_MINUTES` (defaults by profile: `low=180`, `medium=60`)
- `VESSELFINDER_SHORTLIST_REFRESH_MINUTES` (defaults by profile: `low=30`, `medium=10`)
- `VESSELFINDER_WATCHLIST_TTL_MINUTES` (default: `720`)
- `RADAR_LIVE_CACHE_TTL_SECONDS` (default: `300`)
- `RADAR_LIVE_FETCH_PORT_CALLS` (default: `false`)
- `RADAR_LIVE_PORT_CALLS_TTL_MINUTES` (default: `360`)
- `RADAR_ROLLING_WINDOW_HOURS` (default: `120`, min `72`, max `168`)
- `WATCHLIST_RETENTION_HOURS` (default: `72`, min `24`, max `96`)
- `WATCHLIST_REENRICH_HOURS` (default: `8`, min `2`, max `24`)

## Estimated API Usage Footprint

These are approximate and depend on how many shortlisted vessels are active.

### Low usage mode (`RADAR_LIVE_USAGE_PROFILE=low`)

- Scanned ports: 3 Morocco ports
- Default non-shortlist refresh: every 180 min
- Shortlist refresh: every 30 min
- Typical `expectedarrivals` footprint:
  - quiet period: ~24-36 calls/day
  - with active shortlist: ~60-90 calls/day
- `portcalls` footprint: `0` by default (disabled)

### Medium usage mode (`RADAR_LIVE_USAGE_PROFILE=medium`)

- Scanned ports: all Morocco destination ports
- Default non-shortlist refresh: every 60 min
- Shortlist refresh: every 10 min
- Typical `expectedarrivals` footprint:
  - quiet period: ~120-160 calls/day
  - with active shortlist: ~180-260 calls/day
- `portcalls` footprint: still near-zero unless explicitly enabled

## Provider Switching

Provider selection is environment-driven:

- `RADAR_DATA_MODE=mock` -> forces mock provider
- `RADAR_DATA_MODE=live` + `AIS_PROVIDER=hybrid` -> `HybridAISProvider` (AISStream + Datalastic)
- `RADAR_DATA_MODE=live` + `AIS_PROVIDER=vesselfinder` -> live provider

If live mode is misconfigured (missing key, unsupported provider, upstream failure), the system fails gracefully and falls back to mock data with warning metadata in `/api/live-vessels`.

## Local Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Prisma / PostgreSQL

Mock mode works without DB writes.  
Live mode uses a lightweight persistence path to store normalized snapshots (vessels/voyages/scoring + port calls when available), and benefits from an active PostgreSQL.

If PostgreSQL is unavailable, live mode remains usable:
- live ingestion and scoring continue
- persistence is treated as best-effort
- DB-unavailable errors are logged quietly (without breaking the feed)

```bash
npm run db:push
npm run db:seed
```

## Mock Data

- 28 vessels across multiple profiles (bulk/general cargo/non-agri types)
- Early-departure scenarios from Rouen, Constanta, Odessa, Chornomorsk, and others
- Ambiguous and non-Morocco scenarios included
- Commodity profile variation (wheat, barley, corn, soybean meal)
- Live movement simulation via `/api/live-vessels` (polling every 40s)
