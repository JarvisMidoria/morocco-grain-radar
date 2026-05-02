"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEta, formatRelativeTime } from "@/lib/formatters";
import {
  AnalystAnnotationLabel,
  AnalystFeedbackRecord,
  AnalystVerdict,
} from "@/lib/workflow/types";

interface VesselFeedbackPanelProps {
  vessel: {
    id: string;
    name: string;
    predictedCommodity: "wheat" | "barley" | "corn" | "soybeanMeal";
    predictedDetectionPhase:
      | "departure_detected"
      | "morocco_bound_suspected"
      | "morocco_bound_likely"
      | "agri_cargo_likely"
      | "commodity_hypothesis"
      | "near_arrival_confirmed";
    predictedMoroccoBoundScore: number;
    predictedAgriCargoScore: number;
    predictedDeparturePort: string;
    predictedDepartureCountry: string;
    predictedDestinationPort: string;
    predictedCurrentMaritimeZone: string;
    predictedDepartureDetectedAt: string;
    predictedEta: string;
  };
  initialFeedback: AnalystFeedbackRecord | null;
}

interface FeedbackState {
  annotations: AnalystAnnotationLabel[];
  moroccoBoundVerdict: AnalystVerdict;
  commodityVerdict: AnalystVerdict;
  actualCommodity: "" | "wheat" | "barley" | "corn" | "soybeanMeal";
  note: string;
}

const ANNOTATION_OPTIONS: Array<{ value: AnalystAnnotationLabel; label: string }> = [
  { value: "interesting", label: "Interesting" },
  { value: "false_positive", label: "False positive" },
  { value: "to_confirm", label: "To confirm" },
  { value: "probable_cargo", label: "Probable cargo" },
];

const VERDICT_OPTIONS: Array<{ value: AnalystVerdict; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
];

const COMMODITY_OPTIONS = [
  { value: "", label: "Unknown / not confirmed" },
  { value: "wheat", label: "Wheat" },
  { value: "barley", label: "Barley" },
  { value: "corn", label: "Corn" },
  { value: "soybeanMeal", label: "Soybean Meal" },
] as const;

function commodityLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function phaseLabel(value: string) {
  return value.replaceAll("_", " ");
}

function buildFeedbackState(feedback: AnalystFeedbackRecord | null): FeedbackState {
  return {
    annotations: feedback?.annotations ?? [],
    moroccoBoundVerdict: feedback?.moroccoBoundVerdict ?? "pending",
    commodityVerdict: feedback?.commodityVerdict ?? "pending",
    actualCommodity: feedback?.actualCommodity ?? "",
    note: feedback?.note ?? "",
  };
}

function verdictBadgeVariant(value: AnalystVerdict) {
  if (value === "confirmed") {
    return "high";
  }
  if (value === "rejected") {
    return "low";
  }
  return "default";
}

export function VesselFeedbackPanel({ vessel, initialFeedback }: VesselFeedbackPanelProps) {
  const [feedback, setFeedback] = useState<AnalystFeedbackRecord | null>(initialFeedback);
  const [state, setState] = useState<FeedbackState>(() => buildFeedbackState(initialFeedback));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggleAnnotation(label: AnalystAnnotationLabel) {
    setState((current) => ({
      ...current,
      annotations: current.annotations.includes(label)
        ? current.annotations.filter((value) => value !== label)
        : [...current.annotations, label].sort(),
    }));
  }

  async function saveFeedback() {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_feedback",
          payload: {
            vesselId: vessel.id,
            vesselName: vessel.name,
            annotations: state.annotations,
            moroccoBoundVerdict: state.moroccoBoundVerdict,
            commodityVerdict: state.commodityVerdict,
            actualCommodity: state.actualCommodity || null,
            note: state.note,
            predictedCommodity: vessel.predictedCommodity,
            predictedDetectionPhase: vessel.predictedDetectionPhase,
            predictedMoroccoBoundScore: vessel.predictedMoroccoBoundScore,
            predictedAgriCargoScore: vessel.predictedAgriCargoScore,
            predictedDeparturePort: vessel.predictedDeparturePort,
            predictedDepartureCountry: vessel.predictedDepartureCountry,
            predictedDestinationPort: vessel.predictedDestinationPort,
            predictedCurrentMaritimeZone: vessel.predictedCurrentMaritimeZone,
            predictedDepartureDetectedAt: vessel.predictedDepartureDetectedAt,
            predictedEta: vessel.predictedEta,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("validation save failed");
      }

      const payload = (await response.json()) as { feedback: AnalystFeedbackRecord | null };
      setFeedback(payload.feedback);
      setState(buildFeedbackState(payload.feedback));
      setMessage("Validation review saved.");
    } catch {
      setMessage("Validation review failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analyst Validation</CardTitle>
        <CardDescription>Capture analyst judgement, annotate false positives, and confirm the commodity call.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Annotations
              </div>
              <div className="flex flex-wrap gap-2">
                {ANNOTATION_OPTIONS.map((option) => {
                  const active = state.annotations.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleAnnotation(option.value)}
                      className={
                        active
                          ? "rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"
                          : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium text-slate-900">Morocco-bound verdict</span>
                <select
                  value={state.moroccoBoundVerdict}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      moroccoBoundVerdict: event.target.value as AnalystVerdict,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
                >
                  {VERDICT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium text-slate-900">Commodity verdict</span>
                <select
                  value={state.commodityVerdict}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      commodityVerdict: event.target.value as AnalystVerdict,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
                >
                  {VERDICT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Actual commodity</span>
              <select
                value={state.actualCommodity}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    actualCommodity: event.target.value as FeedbackState["actualCommodity"],
                  }))
                }
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
              >
                {COMMODITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Analyst note</span>
              <textarea
                value={state.note}
                onChange={(event) => setState((current) => ({ ...current, note: event.target.value }))}
                rows={4}
                placeholder="What makes this case valid, weak, or commercially relevant?"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveFeedback} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Review"}
              </Button>
              {message ? <div className="text-sm text-slate-600">{message}</div> : null}
              {feedback ? (
                <div className="text-xs text-slate-500">Last reviewed {formatRelativeTime(feedback.lastReviewedAt)}</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Model snapshot</div>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Detection phase</span>
                <span className="font-medium text-slate-900">{phaseLabel(vessel.predictedDetectionPhase)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Predicted commodity</span>
                <span className="font-medium text-slate-900">{commodityLabel(vessel.predictedCommodity)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Morocco score</span>
                <span className="font-medium text-slate-900">{vessel.predictedMoroccoBoundScore}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Agri score</span>
                <span className="font-medium text-slate-900">{vessel.predictedAgriCargoScore}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Departure</span>
                <span className="font-medium text-slate-900">
                  {vessel.predictedDeparturePort}
                  {vessel.predictedDepartureCountry ? `, ${vessel.predictedDepartureCountry}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Destination</span>
                <span className="font-medium text-slate-900">{vessel.predictedDestinationPort}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Corridor context</span>
                <span className="font-medium text-slate-900">{vessel.predictedCurrentMaritimeZone}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Departure detected</span>
                <span className="font-medium text-slate-900">{formatEta(vessel.predictedDepartureDetectedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">ETA</span>
                <span className="font-medium text-slate-900">{formatEta(vessel.predictedEta)}</span>
              </div>
            </div>

            {feedback ? (
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Saved status</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={verdictBadgeVariant(feedback.moroccoBoundVerdict)}>
                    Morocco {feedback.moroccoBoundVerdict}
                  </Badge>
                  <Badge variant={verdictBadgeVariant(feedback.commodityVerdict)}>
                    Commodity {feedback.commodityVerdict}
                  </Badge>
                  {feedback.actualCommodity ? (
                    <Badge variant="default">{commodityLabel(feedback.actualCommodity)}</Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
