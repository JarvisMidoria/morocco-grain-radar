export type ThemePreference = "light" | "dark" | "system";
export type ProviderStatus = "connected" | "missing_key" | "invalid" | "error";
export type ProviderId =
  | "aisstream"
  | "globalFishingWatch"
  | "vesselfinder"
  | "datalastic"
  | "marinetraffic";
export type CoreRadarMode = "mock" | "live" | "hybrid";
export type RuntimeMode = "mock" | "live";
export type RuntimeProvider = "mock" | "vesselfinder" | "marinetraffic" | "hybrid";

export interface PublicProviderSettings {
  enabled: boolean;
  hasKey: boolean;
  status: ProviderStatus;
  lastError: string | null;
  lastTestedAt: string | null;
}

export interface PublicRadarSettings {
  appearance: {
    theme: ThemePreference;
  };
  core: {
    radarDataMode: CoreRadarMode;
    refreshIntervalSeconds: number;
    rollingWindowHours: number;
    watchlistRetentionHours: number;
    reEnrichmentCadenceHours: number;
  };
  providers: Record<ProviderId, PublicProviderSettings>;
  favorites: Array<{
    vesselId: string;
    timestamp: string;
  }>;
  updatedAt: string;
}
