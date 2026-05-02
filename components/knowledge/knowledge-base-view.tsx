"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getKnowledgeBaseCatalog } from "@/lib/knowledge/catalog";
import type { KnowledgeOverrideKind, KnowledgeOverrideSummary } from "@/lib/knowledge/overrides";

interface KnowledgeBaseViewProps {
  catalog: ReturnType<typeof getKnowledgeBaseCatalog>;
  overrideSummary: KnowledgeOverrideSummary;
}

type OverrideMode = "append" | "replace";

const OVERRIDE_KIND_LABELS: Record<KnowledgeOverrideKind, string> = {
  export_origins: "Export origins",
  terminals: "Terminals",
  morocco_destinations: "Morocco destinations",
};

function relevanceVariant(value: string) {
  if (value === "high") {
    return "high";
  }
  if (value === "medium") {
    return "medium";
  }
  return "default";
}

function matchesQuery(query: string, values: Array<string | string[]>) {
  if (!query) {
    return true;
  }

  const haystack = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function KnowledgeBaseView({ catalog, overrideSummary }: KnowledgeBaseViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState<KnowledgeOverrideKind>("morocco_destinations");
  const [mode, setMode] = useState<OverrideMode>("append");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState(overrideSummary);
  const [message, setMessage] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(
    () => ({
      exportOrigins: catalog.exportOrigins.filter((item) =>
        matchesQuery(normalizedQuery, [
          item.name,
          item.country,
          item.region,
          item.aliases,
          item.corridors,
          item.likelyVesselClasses,
        ]),
      ),
      terminals: catalog.terminals.filter((item) =>
        matchesQuery(normalizedQuery, [
          item.terminalName,
          item.portName,
          item.country,
          item.region,
          item.aliases,
          item.terminalType,
        ]),
      ),
      moroccoDestinations: catalog.moroccoDestinations.filter((item) =>
        matchesQuery(normalizedQuery, [
          item.portName,
          item.aliases,
          item.likelySourceRegions,
          item.grainRelevance,
          item.feedRelevance,
        ]),
      ),
      vesselClasses: catalog.vesselClasses.filter((item) =>
        matchesQuery(normalizedQuery, [
          item.label,
          item.cargoCompatibility,
          item.moroccoTradeRelevance,
          item.routePatterns,
        ]),
      ),
    }),
    [catalog.exportOrigins, catalog.moroccoDestinations, catalog.terminals, catalog.vesselClasses, normalizedQuery],
  );

  async function runImport() {
    if (!csv.trim()) {
      setMessage("Paste CSV content or load a file first.");
      return;
    }

    setBusy("import");
    setMessage(null);

    try {
      const response = await fetch("/api/knowledge/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: selectedKind,
          mode,
          csv,
        }),
      });
      const payload = (await response.json()) as
        | { importedCount: number; summary: KnowledgeOverrideSummary }
        | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Knowledge import failed.");
      }

      setSummary(payload.summary);
      setMessage(`${payload.importedCount} ${OVERRIDE_KIND_LABELS[selectedKind].toLowerCase()} imported.`);
      setCsv("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Knowledge import failed.");
    } finally {
      setBusy(null);
    }
  }

  async function clearSelectedKind() {
    setBusy("clear");
    setMessage(null);

    try {
      const response = await fetch(`/api/knowledge/overrides?kind=${selectedKind}`, { method: "DELETE" });
      const payload = (await response.json()) as { summary: KnowledgeOverrideSummary } | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Knowledge reset failed.");
      }

      setSummary(payload.summary);
      setMessage(`${OVERRIDE_KIND_LABELS[selectedKind]} overrides cleared.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Knowledge reset failed.");
    } finally {
      setBusy(null);
    }
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    setCsv(text);
    setMessage(`Loaded ${file.name}.`);
    event.target.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Knowledge Base</h1>
          <p className="text-sm text-slate-500">
            Domain intelligence currently feeding origin, terminal, destination, and vessel-class reasoning.
          </p>
        </div>
        <div className="w-full max-w-sm">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search port, terminal, region, alias..."
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge Overrides</CardTitle>
          <CardDescription>
            Import CSV overrides without editing code. These entries are stored locally in `.radar/knowledge-overrides.json`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Export origin overrides</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{summary.exportOrigins}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Terminal overrides</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{summary.terminals}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Morocco destination overrides</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{summary.moroccoDestinations}</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[180px_160px_1fr_auto]">
            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Knowledge set</span>
              <select
                value={selectedKind}
                onChange={(event) => setSelectedKind(event.target.value as KnowledgeOverrideKind)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                {Object.entries(OVERRIDE_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Mode</span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as OverrideMode)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                <option value="append">Append / upsert</option>
                <option value="replace">Replace this set</option>
              </select>
            </label>

            <div className="space-y-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">CSV source</span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  Load CSV file
                  <input type="file" accept=".csv,text/csv" onChange={loadFile} className="hidden" />
                </label>
                <a
                  href={`/api/knowledge/overrides/template?kind=${selectedKind}`}
                  className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Download template
                </a>
                <div className="text-xs text-slate-500">
                  Updated {summary.updatedAt ? new Date(summary.updatedAt).toLocaleString() : "never"}
                </div>
              </div>
            </div>

            <div className="flex items-end justify-end gap-2">
              <Button type="button" variant="outline" onClick={clearSelectedKind} disabled={busy !== null}>
                Clear set
              </Button>
              <Button type="button" onClick={runImport} disabled={busy !== null}>
                {busy === "import" ? "Importing..." : "Import CSV"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
              Paste CSV directly
            </div>
            <textarea
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              rows={8}
              placeholder="Paste CSV rows here..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-500"
            />
          </div>

          {message ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Export origin profiles</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{filtered.exportOrigins.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Terminal profiles</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{filtered.terminals.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Morocco destination profiles</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{filtered.moroccoDestinations.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vessel class profiles</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{filtered.vesselClasses.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export Origin Intelligence</CardTitle>
          <CardDescription>Seeded origin-side commodity priors, corridor links, and vessel classes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Port</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Commodity weights</TableHead>
                <TableHead>Corridors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.exportOrigins.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="align-top">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.country}</div>
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-700">{item.region}</TableCell>
                  <TableCell className="align-top text-sm text-slate-700">{item.commodityWeightsLabel}</TableCell>
                  <TableCell className="align-top text-sm text-slate-700">
                    {item.corridors.join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terminal Intelligence</CardTitle>
          <CardDescription>Terminal-side commodity biases layered on top of export-port context.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Terminal</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Commodity weights</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.terminals.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="align-top">
                    <div className="font-medium text-slate-900">{item.terminalName}</div>
                    <div className="text-xs text-slate-500">{item.country}</div>
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-700">{item.portName}</TableCell>
                  <TableCell className="align-top text-sm text-slate-700">{item.terminalType}</TableCell>
                  <TableCell className="align-top text-sm text-slate-700">{item.commodityWeightsLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Morocco Destination Profiles</CardTitle>
          <CardDescription>Import-side relevance by port, including likely source regions and commodity demand.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Port</TableHead>
                <TableHead>Grain / Feed relevance</TableHead>
                <TableHead>Likely source regions</TableHead>
                <TableHead>Commodity weights</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.moroccoDestinations.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="align-top">
                    <div className="font-medium text-slate-900">{item.portName}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {item.aliases.slice(0, 3).map((alias) => (
                        <Badge key={alias} variant="default">
                          {alias}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={relevanceVariant(item.grainRelevance)}>Grain {item.grainRelevance}</Badge>
                      <Badge variant={relevanceVariant(item.feedRelevance)}>Feed {item.feedRelevance}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-700">
                    {item.likelySourceRegions.join(", ")}
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-700">{item.commodityWeightsLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vessel Class Profiles</CardTitle>
          <CardDescription>Compatibility assumptions applied when the model interprets dry-bulk routing behavior.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Morocco trade relevance</TableHead>
                <TableHead>Typical route patterns</TableHead>
                <TableHead>Commodity weights</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.vesselClasses.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="align-top">
                    <div className="font-medium text-slate-900">{item.label}</div>
                    <div className="text-xs text-slate-500">{item.cargoCompatibility} cargo compatibility</div>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={relevanceVariant(item.moroccoTradeRelevance)}>
                      {item.moroccoTradeRelevance}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-700">
                    {item.routePatterns.join(", ")}
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-700">{item.commodityWeightsLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
