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
  type LucideIcon,
} from "lucide-react";
import type { HealthResponse } from "@/types";
import { WorktreePanel } from "@/components/WorktreePanel";
import { LiveView } from "@/views/LiveView";
import { PlanView } from "@/views/PlanView";
import { InsightsView } from "@/views/InsightsView";
import { useNotifications } from "@/hooks/useNotifications";
import { Tooltip } from "@/components/ui/tooltip";

type ViewMode = "live" | "plan" | "insights" | "worktrees";

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
];

interface UsageData {
  remaining?: number;
  total?: number;
  tokensUsed?: number;
  resetAt?: string;
  [key: string]: unknown;
}

export default function Dashboard() {
  const [mode, setMode] = useState<ViewMode>("live");
  const [availableModes, setAvailableModes] = useState({ live: false, plan: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const { showDeniedBanner, dismissDeniedBanner, sseConnected } = useNotifications();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch("/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: UsageData | null) => { if (d) setUsageData(d); })
      .catch(() => { /* no usage data — widget stays hidden */ });
  }, []);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data: HealthResponse) => {
        setAvailableModes(data.modes);
        if (data.modes.live) setMode("live");
        else if (data.modes.plan) setMode("plan");
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
        ? availableModes.live ? "live" : "plan"
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
            <h1 className="text-lg font-semibold text-foreground">claudedash</h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              v0.5.4
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
              )
            )}
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

          {/* Usage quota widget — hidden when no data */}
          {usageData && (
            <Tooltip
              content={[
                usageData.remaining != null && usageData.total != null
                  ? `${String(usageData.remaining)} / ${String(usageData.total)} messages remaining`
                  : null,
                usageData.tokensUsed != null
                  ? `${String(usageData.tokensUsed)} tokens used`
                  : null,
                usageData.resetAt
                  ? `Resets: ${new Date(String(usageData.resetAt)).toLocaleString()}`
                  : null,
              ].filter(Boolean).join(" · ") || "Usage data available"}
              side="bottom"
            >
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/60 text-xs text-muted-foreground cursor-default">
                {usageData.remaining != null && usageData.total != null ? (
                  <>
                    <span className={`font-medium ${
                      usageData.remaining / usageData.total < 0.1
                        ? "text-chart-5"
                        : usageData.remaining / usageData.total < 0.3
                          ? "text-chart-3"
                          : "text-chart-2"
                    }`}>
                      {Math.round(usageData.remaining / usageData.total * 100)}%
                    </span>
                    <span className="opacity-50">quota</span>
                  </>
                ) : (
                  <span>quota</span>
                )}
              </div>
            </Tooltip>
          )}

          {/* SSE connection indicator */}
          <Tooltip
            content={sseConnected ? "Live connection active · Server-Sent Events" : "Connecting to server…"}
            side="bottom"
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground cursor-default">
              <span
                className={`size-2 rounded-full ${
                  sseConnected ? "bg-chart-2 animate-pulse" : "bg-muted-foreground/40"
                }`}
              />
              <span className="hidden sm:inline">
                {sseConnected ? "live" : "connecting"}
              </span>
            </div>
          </Tooltip>

          {/* Insights lightbulb — secondary nav */}
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
        ) : (
          <InsightsView />
        )}
      </div>
    </div>
  );
}
