"use client";

import { useState, useEffect } from "react";
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
  type LucideIcon,
} from "lucide-react";
import type { HealthResponse, UsageStats } from "@/types";
import { WorktreePanel } from "@/components/WorktreePanel";
import { LiveView } from "@/views/LiveView";
import { PlanView } from "@/views/PlanView";
import { InsightsView } from "@/views/InsightsView";
import { ActivityView } from "@/views/ActivityView";
import { PlansLibraryView } from "@/views/PlansLibraryView";
import { useNotifications } from "@/hooks/useNotifications";
import { Tooltip } from "@/components/ui/tooltip";

type ViewMode = "live" | "plan" | "worktrees" | "activity" | "insights" | "plans";

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
    label: "Plan",
    tooltip: "Queue-based task planning and execution tracker",
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
    label: "Plans",
    tooltip: "Claude Code plan documents from ~/.claude/plans/",
    show: () => true,
  },
];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function Dashboard() {
  const [mode, setMode] = useState<ViewMode>("live");
  const [availableModes, setAvailableModes] = useState({ live: false, plan: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const { showDeniedBanner, dismissDeniedBanner, sseConnected } = useNotifications();

  useEffect(() => { setMounted(true); }, []);

  // Fetch usage stats for top bar widget
  useEffect(() => {
    fetch("/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: UsageStats | null) => { if (d) setUsageStats(d); })
      .catch(() => { /* no data — widget stays hidden */ });
  }, []);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data: HealthResponse) => {
        setAvailableModes(data.modes);
        if (data.modes.live) setMode("live");
        else if (data.modes.plan) setMode("plan");
        else setMode("activity");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to connect to server");
        setLoading(false);
      });
  }, []);

  const handleInsightsToggle = () => {
    setMode((prev) =>
      prev === "insights"
        ? availableModes.live ? "live" : availableModes.plan ? "plan" : "activity"
        : "insights"
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

  // Top-bar widget tooltip content
  const widgetTooltip = usageStats ? [
    `${fmtNum(usageStats.totalMessages)} messages · ${fmtNum(usageStats.totalSessions)} sessions`,
    usageStats.firstSessionDate
      ? `Since ${new Date(usageStats.firstSessionDate).toLocaleDateString()}`
      : null,
    usageStats.lastComputedDate
      ? `Stats date: ${usageStats.lastComputedDate}`
      : null,
  ].filter(Boolean).join(" · ") : "";

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Notification permission denied banner */}
      {showDeniedBanner && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center justify-between text-xs text-destructive shrink-0">
          <span>
            Browser notifications are blocked. Enable them in your browser settings to get alerts when tasks fail or complete.
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
          <Tooltip content={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} side="bottom">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"
            >
              {sidebarCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </Tooltip>

          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-foreground">claudedash</h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">v1.0.0</span>
          </div>

          {/* Main nav tabs */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {NAV_TABS.filter((t) => t.show(availableModes)).map(({ id, icon: Icon, label, tooltip }) => (
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
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter..."
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
                <span className="font-medium text-foreground">{fmtNum(usageStats.totalMessages)}</span>
                <span className="opacity-50">msgs</span>
                <span className="opacity-30">·</span>
                <span className="font-medium text-foreground">{fmtNum(usageStats.totalSessions)}</span>
                <span className="opacity-50">sessions</span>
              </button>
            </Tooltip>
          )}

          {/* SSE connection indicator */}
          <Tooltip
            content={sseConnected ? "Live connection active · Server-Sent Events" : "Connecting to server…"}
            side="bottom"
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground cursor-default">
              <span className={`size-2 rounded-full ${sseConnected ? "bg-chart-2 animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="hidden sm:inline">{sseConnected ? "live" : "connecting"}</span>
            </div>
          </Tooltip>

          {/* Insights lightbulb */}
          <Tooltip content="Claude Code usage analytics · Run /insight to generate" side="bottom">
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

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {mode === "live" ? (
          <LiveView searchQuery={searchQuery} sidebarCollapsed={sidebarCollapsed} mounted={mounted} />
        ) : mode === "plan" ? (
          <PlanView searchQuery={searchQuery} sidebarCollapsed={sidebarCollapsed} mounted={mounted} />
        ) : mode === "worktrees" ? (
          <WorktreePanel />
        ) : mode === "activity" ? (
          <ActivityView />
        ) : mode === "plans" ? (
          <PlansLibraryView />
        ) : (
          <InsightsView />
        )}
      </div>
    </div>
  );
}
