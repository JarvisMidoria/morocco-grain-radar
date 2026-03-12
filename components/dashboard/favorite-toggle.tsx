"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteToggleProps {
  vesselId: string;
  initialFavorite?: boolean;
}

export function FavoriteToggle({ vesselId, initialFavorite = false }: FavoriteToggleProps) {
  const [isFavorite, setIsFavorite] = useState(Boolean(initialFavorite));
  const [isSaving, setIsSaving] = useState(false);

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
      setIsFavorite(Boolean(payload.isFavorite));
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
        "inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
        isFavorite
          ? "border-amber-300 bg-amber-50 text-amber-500"
          : "border-slate-200 bg-white text-slate-400 hover:text-slate-600",
      )}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      title={isFavorite ? "Favorite vessel" : "Mark as favorite"}
      disabled={isSaving}
    >
      <Star className="h-3.5 w-3.5" fill={isFavorite ? "currentColor" : "none"} />
    </button>
  );
}
