"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteToggleProps {
  vesselId: string;
  initialFavorite?: boolean;
  showLabel?: boolean;
  refreshOnChange?: boolean;
  className?: string;
}

interface FavoriteChangedDetail {
  vesselId: string;
  isFavorite: boolean;
}

const FAVORITE_CHANGED_EVENT = "radar:favorite-changed";

export function FavoriteToggle({
  vesselId,
  initialFavorite = false,
  showLabel = false,
  refreshOnChange = false,
  className,
}: FavoriteToggleProps) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(Boolean(initialFavorite));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsFavorite(Boolean(initialFavorite));
  }, [initialFavorite]);

  useEffect(() => {
    function onFavoriteChanged(event: Event) {
      const detail = (event as CustomEvent<FavoriteChangedDetail>).detail;
      if (detail?.vesselId === vesselId) {
        setIsFavorite(Boolean(detail.isFavorite));
      }
    }

    window.addEventListener(FAVORITE_CHANGED_EVENT, onFavoriteChanged);
    return () => window.removeEventListener(FAVORITE_CHANGED_EVENT, onFavoriteChanged);
  }, [vesselId]);

  async function onToggle() {
    if (isSaving) {
      return;
    }

    const nextFavorite = !isFavorite;
    setIsFavorite(nextFavorite);
    setIsSaving(true);

    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vesselId,
          favorite: nextFavorite,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update favorite");
      }

      const payload = (await response.json()) as { isFavorite?: boolean };
      const confirmedFavorite = Boolean(payload.isFavorite);
      setIsFavorite(confirmedFavorite);
      window.dispatchEvent(
        new CustomEvent<FavoriteChangedDetail>(FAVORITE_CHANGED_EVENT, {
          detail: {
            vesselId,
            isFavorite: confirmedFavorite,
          },
        }),
      );
      if (refreshOnChange) {
        router.refresh();
      }
    } catch {
      setIsFavorite(!nextFavorite);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center justify-center rounded-full border transition-colors",
        showLabel ? "h-9 gap-2 px-3 text-sm font-medium" : "h-7 w-7",
        isFavorite
          ? "border-amber-300 bg-amber-50 text-amber-500"
          : "border-slate-200 bg-white text-slate-400 hover:text-slate-600",
        className,
      )}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      title={isFavorite ? "Favorite vessel" : "Mark as favorite"}
      disabled={isSaving}
    >
      <Star className="h-3.5 w-3.5" fill={isFavorite ? "currentColor" : "none"} />
      {showLabel && <span>{isFavorite ? "Favorited" : "Favorite"}</span>}
    </button>
  );
}
