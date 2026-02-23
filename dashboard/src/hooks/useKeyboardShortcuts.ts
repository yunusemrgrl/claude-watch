"use client";

import { useEffect, useCallback } from "react";

type ViewMode = "live" | "plan" | "worktrees" | "activity" | "insights" | "plans" | "claudemd" | "snapshots";

interface UseKeyboardShortcutsOptions {
  setMode: (mode: ViewMode) => void;
  availableModes: { live: boolean; plan: boolean };
  setSearchFocused: () => void;
  clearSearch: () => void;
  setShowCheatsheet: (v: boolean) => void;
  showCheatsheet: boolean;
}

export function useKeyboardShortcuts({
  setMode,
  availableModes,
  setSearchFocused,
  clearSearch,
  setShowCheatsheet,
  showCheatsheet,
}: UseKeyboardShortcutsOptions) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        if (e.key === "Escape") {
          clearSearch();
          (target as HTMLInputElement).blur();
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "?":
          setShowCheatsheet(!showCheatsheet);
          break;
        case "Escape":
          if (showCheatsheet) setShowCheatsheet(false);
          else clearSearch();
          break;
        case "l":
        case "L":
          if (availableModes.live) setMode("live");
          break;
        case "q":
        case "Q":
          if (availableModes.plan) setMode("plan");
          break;
        case "a":
        case "A":
          setMode("activity");
          break;
        case "d":
        case "D":
          setMode("plans");
          break;
        case "w":
        case "W":
          setMode("worktrees");
          break;
        case "c":
        case "C":
          if (availableModes.plan) setMode("claudemd");
          break;
        case "/":
          e.preventDefault();
          setSearchFocused();
          break;
        default:
          break;
      }
    },
    [setMode, availableModes, setSearchFocused, clearSearch, setShowCheatsheet, showCheatsheet],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);
}
