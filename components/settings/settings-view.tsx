"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ProviderId,
  ThemePreference,
  PublicRadarSettings,
} from "@/lib/settings/types";

interface SettingsViewProps {
  initialSettings: PublicRadarSettings;
}

interface DiagnosticsReport {
  generatedAt: string;
  mode: "mock" | "live";
  windowHours: number;
  aggregates: {
    vesselCount: number;
    avgTopPosteriorProbability: number;
    avgEntropy: number;
    avgUncertaintyPenalty: number;
    avgEvidenceCoverage: number;
  };
  strongestCandidates: Array<{
    vesselId: string;
    vesselName: string;
    commodity: string;
    topPosteriorProbability: number;
    entropy: number;
    uncertaintyPenalty: number;
    predictionConfidenceBand: "weak" | "moderate" | "strong";
  }>;
  weakestCandidates: Array<{
    vesselId: string;
    vesselName: string;
    commodity: string;
    topPosteriorProbability: number;
    entropy: number;
    uncertaintyPenalty: number;
    predictionConfidenceBand: "weak" | "moderate" | "strong";
  }>;
  falsePositives: Array<{
    vesselId: string;
    vesselName: string;
    reason: string;
  }>;
  missingInformationSignals: Array<{
    signal: string;
    count: number;
    averageValue: number;
  }>;
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  aisstream: "AISStream",
  globalFishingWatch: "Global Fishing Watch",
  vesselfinder: "VesselFinder",
  datalastic: "Datalastic",
  marinetraffic: "MarineTraffic",
};

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldUseDark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", shouldUseDark);
}

function statusBadge(status: "connected" | "missing_key" | "invalid" | "error") {
  if (status === "connected") {
    return <Badge variant="high">Connected</Badge>;
  }
  if (status === "missing_key") {
    return <Badge variant="default">Missing key</Badge>;
  }
  if (status === "invalid") {
    return <Badge variant="medium">Invalid</Badge>;
  }
  return <Badge variant="low">Error</Badge>;
}

export function SettingsView({ initialSettings }: SettingsViewProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [providerDraftKeys, setProviderDraftKeys] = useState<Record<ProviderId, string>>({
    aisstream: "",
    globalFishingWatch: "",
    vesselfinder: "",
    datalastic: "",
    marinetraffic: "",
  });
  const [diagnosticsMode, setDiagnosticsMode] = useState<"mock" | "live">("mock");
  const [windowHours, setWindowHours] = useState<24 | 48 | 72>(24);
  const [diagnosticsReport, setDiagnosticsReport] = useState<DiagnosticsReport | null>(null);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [savingProviders, setSavingProviders] = useState(false);
  const [savingCore, setSavingCore] = useState(false);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const providers = settings.providers;
  const providerIds = useMemo(
    () =>
      Object.keys(PROVIDER_LABELS) as ProviderId[],
    [],
  );

  async function saveAppearance() {
    setSavingAppearance(true);
    setLastMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appearance: settings.appearance,
        }),
      });
      const payload = (await response.json()) as { settings: PublicRadarSettings };
      setSettings(payload.settings);
      applyTheme(payload.settings.appearance.theme);
      setLastMessage("Appearance saved.");
    } catch {
      setLastMessage("Failed to save appearance.");
    } finally {
      setSavingAppearance(false);
    }
  }

  async function saveProviders() {
    setSavingProviders(true);
    setLastMessage(null);
    try {
      const providersPayload = providerIds.reduce(
        (accumulator, providerId) => {
          accumulator[providerId] = {
            enabled: providers[providerId].enabled,
            apiKey: providerDraftKeys[providerId].trim() || undefined,
          };
          return accumulator;
        },
        {} as Record<ProviderId, { enabled: boolean; apiKey?: string }>,
      );

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: providersPayload,
        }),
      });
      const payload = (await response.json()) as { settings: PublicRadarSettings };
      setSettings(payload.settings);
      setProviderDraftKeys({
        aisstream: "",
        globalFishingWatch: "",
        vesselfinder: "",
        datalastic: "",
        marinetraffic: "",
      });
      setLastMessage("Provider settings saved.");
    } catch {
      setLastMessage("Failed to save provider settings.");
    } finally {
      setSavingProviders(false);
    }
  }

  async function saveCoreSettings() {
    setSavingCore(true);
    setLastMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          core: settings.core,
        }),
      });
      const payload = (await response.json()) as { settings: PublicRadarSettings };
      setSettings(payload.settings);
      setLastMessage("Core radar settings saved.");
    } catch {
      setLastMessage("Failed to save core radar settings.");
    } finally {
      setSavingCore(false);
    }
  }

  async function runDiagnostics() {
    setRunningDiagnostics(true);
    setLastMessage(null);
    try {
      const response = await fetch("/api/settings/validation-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: diagnosticsMode,
          windowHours,
        }),
      });
      if (!response.ok) {
        throw new Error("Diagnostics request failed");
      }
      const payload = (await response.json()) as { report: DiagnosticsReport };
      setDiagnosticsReport(payload.report);
      setLastMessage("Validation report generated.");
    } catch {
      setLastMessage("Failed to run validation report.");
    } finally {
      setRunningDiagnostics(false);
    }
  }

  async function testProvider(providerId: ProviderId) {
    setLastMessage(null);
    try {
      const response = await fetch("/api/settings/provider-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          apiKey: providerDraftKeys[providerId].trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error("Provider test failed");
      }
      const payload = (await response.json()) as {
        result: {
          status: "connected" | "missing_key" | "invalid" | "error";
          message: string;
          testedAt: string;
        };
      };

      setSettings((current) => ({
        ...current,
        providers: {
          ...current.providers,
          [providerId]: {
            ...current.providers[providerId],
            status: payload.result.status,
            lastError:
              payload.result.status === "error" || payload.result.status === "invalid"
                ? payload.result.message
                : null,
            lastTestedAt: payload.result.testedAt,
          },
        },
      }));
      setLastMessage(`${PROVIDER_LABELS[providerId]}: ${payload.result.message}`);
    } catch {
      setLastMessage(`Failed to test ${PROVIDER_LABELS[providerId]} connection.`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Configure diagnostics, appearance, providers, and core radar behavior.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Brain Diagnostics</CardTitle>
          <CardDescription>Run a validation report on mock or live mode for a rolling time window.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Mode</label>
              <select
                value={diagnosticsMode}
                onChange={(event) => setDiagnosticsMode(event.target.value as "mock" | "live")}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value="mock">Mock</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Window</label>
              <select
                value={windowHours}
                onChange={(event) => setWindowHours(Number(event.target.value) as 24 | 48 | 72)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value={24}>24h</option>
                <option value={48}>48h</option>
                <option value={72}>72h</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={runDiagnostics} disabled={runningDiagnostics} className="w-full">
                {runningDiagnostics ? "Running..." : "Run Validation Report"}
              </Button>
            </div>
          </div>

          {diagnosticsReport && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div>
                  <div className="text-xs text-slate-500">Vessels</div>
                  <div className="text-lg font-semibold text-slate-900">{diagnosticsReport.aggregates.vesselCount}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Avg Posterior</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {diagnosticsReport.aggregates.avgTopPosteriorProbability.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Avg Entropy</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {diagnosticsReport.aggregates.avgEntropy.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Avg Uncertainty</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {diagnosticsReport.aggregates.avgUncertaintyPenalty.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Coverage</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {diagnosticsReport.aggregates.avgEvidenceCoverage.toFixed(1)}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Strongest Candidates
                  </div>
                  <ul className="space-y-2 text-sm">
                    {diagnosticsReport.strongestCandidates.map((candidate) => (
                      <li key={candidate.vesselId} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="font-medium text-slate-900">{candidate.vesselName}</div>
                        <div className="text-xs text-slate-500">
                          {candidate.commodity} · posterior {candidate.topPosteriorProbability.toFixed(1)}% · entropy{" "}
                          {candidate.entropy.toFixed(2)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Weakest Candidates
                  </div>
                  <ul className="space-y-2 text-sm">
                    {diagnosticsReport.weakestCandidates.map((candidate) => (
                      <li key={candidate.vesselId} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="font-medium text-slate-900">{candidate.vesselName}</div>
                        <div className="text-xs text-slate-500">
                          {candidate.commodity} · posterior {candidate.topPosteriorProbability.toFixed(1)}% · entropy{" "}
                          {candidate.entropy.toFixed(2)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    False Positives
                  </div>
                  <ul className="space-y-2 text-sm">
                    {diagnosticsReport.falsePositives.length > 0 ? (
                      diagnosticsReport.falsePositives.map((candidate) => (
                        <li key={candidate.vesselId} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="font-medium text-slate-900">{candidate.vesselName}</div>
                          <div className="text-xs text-slate-500">{candidate.reason}</div>
                        </li>
                      ))
                    ) : (
                      <li className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500">
                        No strong false-positive pattern detected.
                      </li>
                    )}
                  </ul>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Missing Information Signals
                  </div>
                  <ul className="space-y-2 text-sm">
                    {diagnosticsReport.missingInformationSignals.map((item) => (
                      <li key={item.signal} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="font-medium text-slate-900">{item.signal}</div>
                        <div className="text-xs text-slate-500">
                          {item.count} vessels · avg information value {item.averageValue.toFixed(1)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose light, dark, or system theme.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <input
                type="radio"
                name="theme"
                value="light"
                checked={settings.appearance.theme === "light"}
                onChange={() =>
                  setSettings((current) => ({
                    ...current,
                    appearance: { theme: "light" },
                  }))
                }
              />
              Light
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <input
                type="radio"
                name="theme"
                value="dark"
                checked={settings.appearance.theme === "dark"}
                onChange={() =>
                  setSettings((current) => ({
                    ...current,
                    appearance: { theme: "dark" },
                  }))
                }
              />
              Dark
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <input
                type="radio"
                name="theme"
                value="system"
                checked={settings.appearance.theme === "system"}
                onChange={() =>
                  setSettings((current) => ({
                    ...current,
                    appearance: { theme: "system" },
                  }))
                }
              />
              System
            </label>
          </div>
          <Button onClick={saveAppearance} disabled={savingAppearance}>
            {savingAppearance ? "Saving..." : "Save Appearance"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Providers</CardTitle>
          <CardDescription>Configure provider toggles, keys, and health checks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {providerIds.map((providerId) => (
              <div key={providerId} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{PROVIDER_LABELS[providerId]}</div>
                  {statusBadge(providers[providerId].status)}
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={providers[providerId].enabled}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        providers: {
                          ...current.providers,
                          [providerId]: {
                            ...current.providers[providerId],
                            enabled: event.target.checked,
                          },
                        },
                      }))
                    }
                  />
                  Enabled
                </label>
                <Input
                  type="password"
                  placeholder={
                    providers[providerId].hasKey
                      ? "API key configured (set new key to update)"
                      : "Enter API key"
                  }
                  value={providerDraftKeys[providerId]}
                  onChange={(event) =>
                    setProviderDraftKeys((current) => ({
                      ...current,
                      [providerId]: event.target.value,
                    }))
                  }
                />
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={() => testProvider(providerId)}>
                    Test connection
                  </Button>
                  {providers[providerId].lastTestedAt && (
                    <span className="text-xs text-slate-500">Tested {new Date(providers[providerId].lastTestedAt).toLocaleString()}</span>
                  )}
                </div>
                {providers[providerId].lastError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {providers[providerId].lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button onClick={saveProviders} disabled={savingProviders}>
            {savingProviders ? "Saving..." : "Save Provider Configuration"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Core Radar Settings</CardTitle>
          <CardDescription>Control data mode and refresh/cadence parameters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Radar data mode</label>
              <select
                value={settings.core.radarDataMode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    core: {
                      ...current.core,
                      radarDataMode: event.target.value as "mock" | "live" | "hybrid",
                    },
                  }))
                }
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value="mock">Mock</option>
                <option value="live">Live</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Refresh interval (s)</label>
              <Input
                type="number"
                min={15}
                max={300}
                value={settings.core.refreshIntervalSeconds}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    core: {
                      ...current.core,
                      refreshIntervalSeconds: Number(event.target.value),
                    },
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Rolling window (h)</label>
              <Input
                type="number"
                min={24}
                max={168}
                value={settings.core.rollingWindowHours}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    core: {
                      ...current.core,
                      rollingWindowHours: Number(event.target.value),
                    },
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Watchlist retention (h)</label>
              <Input
                type="number"
                min={24}
                max={240}
                value={settings.core.watchlistRetentionHours}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    core: {
                      ...current.core,
                      watchlistRetentionHours: Number(event.target.value),
                    },
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Re-enrichment cadence (h)</label>
              <Input
                type="number"
                min={1}
                max={48}
                value={settings.core.reEnrichmentCadenceHours}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    core: {
                      ...current.core,
                      reEnrichmentCadenceHours: Number(event.target.value),
                    },
                  }))
                }
              />
            </div>
          </div>

          <Button onClick={saveCoreSettings} disabled={savingCore}>
            {savingCore ? "Saving..." : "Save Core Settings"}
          </Button>
        </CardContent>
      </Card>

      {lastMessage && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          {lastMessage}
        </div>
      )}
    </div>
  );
}
