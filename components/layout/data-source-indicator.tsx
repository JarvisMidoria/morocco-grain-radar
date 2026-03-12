import { getRadarRuntimeConfig, getRuntimeSourceLabel } from "@/lib/radar/runtime-config";

export function DataSourceIndicator() {
  const runtime = getRadarRuntimeConfig();
  const isLive = runtime.mode === "live" && !runtime.validationError;
  const hasLiveWarning = runtime.mode === "live" && Boolean(runtime.validationError);
  const label = hasLiveWarning
    ? "Mock data · live mode unavailable"
    : getRuntimeSourceLabel(runtime);

  return (
    <div className="mx-auto mt-3 flex max-w-7xl items-center justify-end px-4 sm:px-6 lg:px-8">
      <div
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
          isLive
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : hasLiveWarning
              ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-100 text-slate-700"
        }`}
      >
        {label}
      </div>
    </div>
  );
}
