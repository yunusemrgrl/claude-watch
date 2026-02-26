"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import useSWR from "swr";
import {
  Search,
  RefreshCw,
  Radio,
  ClipboardList,
  GitBranch,
  Lightbulb,
  PanelLeft,
  PanelLeftClose,
  BarChart2,
  FileText,
  Settings,
  Keyboard,
  X,
  Camera,
  type LucideIcon,
} from "lucide-react";
import type { HealthResponse, UsageStats } from "@/types";
import pkg from "./../../../package.json";
import { WorktreePanel } from "@/components/WorktreePanel";
import { LiveView } from "@/views/LiveView";
import { PlanView } from "@/views/PlanView";
import { InsightsView } from "@/views/InsightsView";
import { ActivityView } from "@/views/ActivityView";
import { PlansLibraryView } from "@/views/PlansLibraryView";
import { ClaudeMdView } from "@/views/ClaudeMdView";
import { SnapshotsView } from "@/views/SnapshotsView";
import { useNotifications } from "@/hooks/useNotifications";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Tooltip } from "@/components/ui/tooltip";

type ViewMode =
  | "live"
  | "plan"
  | "worktrees"
  | "activity"
  | "insights"
  | "plans"
  | "claudemd"
  | "snapshots";

const NAV_TABS: {
  id: Exclude<ViewMode, "insights">;
  icon: LucideIcon;
  label: string;
  tooltip: string;
  show: (modes: { live: boolean; plan: boolean }) => boolean;
}[] = [
  {
    id: "live",
    icon: Radio,
    label: "Live",
    tooltip: "Real-time Claude Code session monitor",
    show: (m) => m.live,
  },
  {
    id: "plan",
    icon: ClipboardList,
    label: "Queue",
    tooltip: "Task queue tracker — queue.md · execution.log · agent status",
    show: (m) => m.plan,
  },
  {
    id: "worktrees",
    icon: GitBranch,
    label: "Worktrees",
    tooltip: "Git worktree status across parallel branches",
    show: (m) => m.live || m.plan,
  },
  {
    id: "activity",
    icon: BarChart2,
    label: "Activity",
    tooltip: "Usage stats, session history and token breakdown",
    show: () => true,
  },
  {
    id: "plans",
    icon: FileText,
    label: "Docs",
    tooltip: "Claude Code plan documents from ~/.claude/plans/",
    show: () => true,
  },
  {
    id: "claudemd",
    icon: Settings,
    label: "Config",
    tooltip: "Edit CLAUDE.md agent instruction files",
    show: (m) => m.plan,
  },
  {
    id: "snapshots",
    icon: Camera,
    label: "Snapshots",
    tooltip: "Context snapshots — roll back code and Claude context together",
    show: (m) => m.plan,
  },
];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type HttpError = Error & { status?: number };

async function jsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`) as HttpError;
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

export default function Dashboard() {
  const [mode, setMode] = useState<ViewMode>("live");
  const [availableModes, setAvailableModes] = useState({
    live: false,
    plan: false,
  });
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { showDeniedBanner, dismissDeniedBanner, sseConnected } =
    useNotifications();
  const { data: usageStats } = useSWR<UsageStats>(
    "/usage",
    jsonFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const { data: healthData, error: healthError } = useSWR<HealthResponse>(
    "/health",
    jsonFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  useKeyboardShortcuts({
    setMode,
    availableModes,
    setSearchFocused: () => searchInputRef.current?.focus(),
    clearSearch: () => setSearchQuery(""),
    setShowCheatsheet,
    showCheatsheet,
  });

  useEffect(() => {
    if (!healthData) return;
    setAvailableModes(healthData.modes);
    if (healthData.modes.live) setMode("live");
    else if (healthData.modes.plan) setMode("plan");
    else setMode("activity");
    setError(null);
    setAuthRequired(false);
    setLoading(false);
  }, [healthData]);

  useEffect(() => {
    if (!healthError) return;
    if ((healthError as HttpError).status === 401) {
      setAuthRequired(true);
      setError(null);
      setLoading(false);
      return;
    }
    setError("Failed to connect to server");
    setLoading(false);
  }, [healthError]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authToken }),
      });
      if (!response.ok) {
        setAuthError("Invalid token");
        return;
      }
      window.location.reload();
    } catch {
      setAuthError("Authentication request failed");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleInsightsToggle = () => {
    setMode((prev) =>
      prev === "insights"
        ? availableModes.live
          ? "live"
          : availableModes.plan
            ? "plan"
            : "activity"
        : "insights",
    );
  };

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-destructive-foreground">Error: {error}</div>
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="h-screen bg-background flex items-center justify-center p-4">
        <form
          onSubmit={handleAuthSubmit}
          className="w-full max-w-md bg-sidebar border border-sidebar-border rounded-xl p-6 space-y-4"
        >
          <div>
            <h1 className="text-lg font-semibold text-foreground">Token Required</h1>
            <p className="text-xs text-muted-foreground mt-1">
              This claudedash server requires authentication. Enter your Bearer token.
            </p>
          </div>
          <input
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="claudedash token"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
          />
          {authError && <p className="text-xs text-destructive">{authError}</p>}
          <button
            type="submit"
            disabled={!authToken || authSubmitting}
            className="w-full bg-foreground text-background rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {authSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    );
  }

  // Top-bar widget tooltip content
  const widgetTooltip = usageStats
    ? [
        `${fmtNum(usageStats.totalMessages)} messages · ${fmtNum(usageStats.totalSessions)} sessions`,
        usageStats.firstSessionDate
          ? `Since ${new Date(usageStats.firstSessionDate).toLocaleDateString()}`
          : null,
        usageStats.lastComputedDate
          ? `Stats date: ${usageStats.lastComputedDate}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Notification permission denied banner */}
      {showDeniedBanner && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center justify-between text-xs text-destructive shrink-0">
          <span>
            Browser notifications are blocked. Enable them in your browser
            settings to get alerts when tasks fail or complete.
          </span>
          <button
            onClick={dismissDeniedBanner}
            className="ml-4 text-destructive/70 hover:text-destructive font-medium shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-sidebar border-b border-sidebar-border px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          {/* Sidebar toggle */}
          <Tooltip
            content={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            side="bottom"
          >
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"
            >
              {sidebarCollapsed ? (
                <PanelLeft className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </Tooltip>

          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-foreground">
              claudedash
            </h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              v{pkg.version}
            </span>
          </div>

          {/* Main nav tabs */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {NAV_TABS.filter((t) => t.show(availableModes)).map(
              ({ id, icon: Icon, label, tooltip }) => (
                <Tooltip key={id} content={tooltip} side="bottom">
                  <button
                    onClick={() => setMode(id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                      mode === id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3" />
                    {label}
                  </button>
                </Tooltip>
              ),
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Filter... (/)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring w-48"
            />
          </div>

          {/* Usage stats widget — always visible once stats-cache.json exists */}
          {usageStats && (
            <Tooltip content={widgetTooltip} side="bottom">
              <button
                onClick={() => setMode("activity")}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/60 hover:bg-muted transition-colors text-xs text-muted-foreground cursor-pointer"
              >
                <BarChart2 className="size-3 text-chart-1" />
                <span className="font-medium text-foreground">
                  {fmtNum(usageStats.totalMessages)}
                </span>
                <span className="opacity-50">msgs</span>
                <span className="opacity-30">·</span>
                <span className="font-medium text-foreground">
                  {fmtNum(usageStats.totalSessions)}
                </span>
                <span className="opacity-50">sessions</span>
              </button>
            </Tooltip>
          )}

          {/* SSE connection indicator */}
          <Tooltip
            content={
              sseConnected
                ? "Live connection active · Server-Sent Events"
                : "Connecting to server…"
            }
            side="bottom"
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground cursor-default">
              <span
                className={`size-2 rounded-full ${sseConnected ? "bg-chart-2 animate-pulse" : "bg-muted-foreground/40"}`}
              />
              <span className="hidden sm:inline">
                {sseConnected ? "live" : "connecting"}
              </span>
            </div>
          </Tooltip>

          {/* Insights lightbulb */}
          <Tooltip
            content="Claude Code usage analytics · Run /insight to generate"
            side="bottom"
          >
            <button
              onClick={handleInsightsToggle}
              className={`p-1.5 rounded transition-colors ${
                mode === "insights"
                  ? "bg-sidebar-accent text-chart-3"
                  : "hover:bg-sidebar-accent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Lightbulb className="size-4" />
            </button>
          </Tooltip>

          {/* Keyboard shortcuts */}
          <Tooltip content="Keyboard shortcuts (?)" side="bottom">
            <button
              onClick={() => setShowCheatsheet(true)}
              className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"
            >
              <Keyboard className="size-3.5 text-muted-foreground" />
            </button>
          </Tooltip>

          {/* Refresh */}
          <Tooltip content="Reload dashboard" side="bottom">
            <button
              className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="size-3.5 text-muted-foreground" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Keyboard shortcut cheatsheet modal */}
      {showCheatsheet && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
          onClick={() => setShowCheatsheet(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCheatsheet(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard Shortcuts"
            className="bg-background border border-border rounded-xl shadow-xl p-6 w-80 max-w-full"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Keyboard className="size-4" /> Keyboard Shortcuts
              </h2>
              <button
                onClick={() => setShowCheatsheet(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-1 text-xs">
              {[
                ["L", "Live view", availableModes.live],
                ["Q", "Queue view", availableModes.plan],
                ["A", "Activity view", true],
                ["D", "Docs view", true],
                [
                  "W",
                  "Worktrees view",
                  availableModes.live || availableModes.plan,
                ],
                ["C", "Config (CLAUDE.md)", availableModes.plan],
                ["/", "Focus search", true],
                ["Esc", "Clear search / close", true],
                ["?", "Toggle this cheatsheet", true],
              ]
                .filter(([, , show]) => show)
                .map(([key, desc]) => (
                  <div
                    key={String(key)}
                    className="flex items-center justify-between py-1 border-b border-border/40 last:border-0"
                  >
                    <span className="text-muted-foreground">
                      {String(desc)}
                    </span>
                    <kbd className="px-2 py-0.5 bg-muted rounded text-[10px] font-mono text-foreground border border-border">
                      {String(key)}
                    </kbd>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {mode === "live" ? (
          <LiveView
            searchQuery={searchQuery}
            sidebarCollapsed={sidebarCollapsed}
          />
        ) : mode === "plan" ? (
          <PlanView
            searchQuery={searchQuery}
            sidebarCollapsed={sidebarCollapsed}
          />
        ) : mode === "worktrees" ? (
          <WorktreePanel />
        ) : mode === "activity" ? (
          <ActivityView />
        ) : mode === "plans" ? (
          <PlansLibraryView />
        ) : mode === "claudemd" ? (
          <ClaudeMdView />
        ) : mode === "snapshots" ? (
          <SnapshotsView />
        ) : (
          <InsightsView />
        )}
      </div>
    </div>
  );
}
