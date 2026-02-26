"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSSEEvents } from "@/hooks/useSSEEvents";
import { BarChart2, Zap, MessageSquare, GitCommit, Clock, RefreshCw, ChevronDown, ChevronRight, DollarSign, Wrench, Award, History, Zap as ZapIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  UsageStats, ActivitySession, ActivitySessionsResponse,
  FacetsResponse, FacetSession, ConversationsResponse, CostResponse,
  HistoryResponse, HistoryPrompt, BillingBlock, HookEvent,
} from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtModelName(id: string): string {
  if (id.includes("opus-4-6")) return "Opus 4.6";
  if (id.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (id.includes("haiku-4-5")) return "Haiku 4.5";
  if (id.includes("opus-4-5")) return "Opus 4.5";
  if (id.includes("sonnet-4-5")) return "Sonnet 4.5";
  if (id.includes("3-5-sonnet")) return "Sonnet 3.5";
  if (id.includes("3-5-haiku")) return "Haiku 3.5";
  const parts = id.split("-");
  return parts.slice(0, 3).join(" ");
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function outcomeColor(outcome: string): string {
  if (outcome === "fully_achieved") return "bg-chart-2";
  if (outcome === "mostly_achieved") return "bg-chart-1";
  if (outcome === "partially_achieved") return "bg-chart-3";
  return "bg-chart-5";
}

function outcomeLabel(outcome: string): string {
  return outcome.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function helpfulnessColor(h: string): string {
  if (h === "essential") return "text-chart-2";
  if (h === "very_helpful") return "text-chart-1";
  if (h === "moderately_helpful") return "text-chart-3";
  return "text-chart-5";
}

function helpfulnessLabel(h: string): string {
  if (h === "essential") return "Essential";
  if (h === "very_helpful") return "Very Helpful";
  if (h === "moderately_helpful") return "Moderate";
  return h.replace(/_/g, " ");
}

// ── Summary Card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, colorClass }: { label: string; value: string; sub?: string; colorClass?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className={`text-2xl font-bold ${colorClass ?? "text-foreground"}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── 7-day bar chart ───────────────────────────────────────────────────────────
function DailyBarChart({ data }: { data: { date: string; messageCount: number; sessionCount: number }[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.messageCount), 1);
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Last 7 Days — Messages</h4>
      <div className="flex items-end gap-1.5 h-24">
        {data.map((d) => {
          const pct = (d.messageCount / max) * 100;
          const shortDate = new Date(d.date).toLocaleDateString("en", { weekday: "short" });
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border border-border text-[10px] text-foreground px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                {d.date}: {fmtNum(d.messageCount)} msgs · {d.sessionCount} sessions
              </div>
              <div
                className="w-full rounded-sm bg-chart-1/70 hover:bg-chart-1 transition-colors min-h-[2px]"
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
              <span className="text-[9px] text-muted-foreground/60">{shortDate}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Hour heatmap ──────────────────────────────────────────────────────────────
function HourHeatmap({ hourCounts }: { hourCounts: Record<string, number> }) {
  const max = Math.max(...Object.values(hourCounts), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Peak Hours</h4>
      <div className="flex gap-0.5">
        {hours.map((h) => {
          const count = hourCounts[String(h)] ?? 0;
          const intensity = count / max;
          const opacity = intensity < 0.1 ? 0.06 : intensity < 0.3 ? 0.2 : intensity < 0.6 ? 0.5 : 0.85;
          return (
            <div key={h} className="relative group flex-1">
              <div className="h-6 rounded-sm bg-chart-2" style={{ opacity }} />
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border border-border text-[10px] text-foreground px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                {h}:00 · {count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/40 mt-1">
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
      </div>
    </div>
  );
}

// ── Model usage table ─────────────────────────────────────────────────────────
function ModelTable({ modelUsage }: { modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number }> }) {
  const entries = Object.entries(modelUsage);
  if (entries.length === 0) return null;
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Model Usage</h4>
      <div className="space-y-2">
        {entries.map(([id, usage]) => {
          const total = usage.inputTokens + usage.outputTokens + usage.cacheReadInputTokens;
          return (
            <div key={id} className="bg-sidebar/50 border border-border rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{fmtModelName(id)}</span>
                <span className="text-xs text-muted-foreground">{fmtNum(total)} total tokens</span>
              </div>
              <div className="flex gap-4 text-[11px]">
                <span className="text-chart-1"><span className="text-muted-foreground">In </span>{fmtNum(usage.inputTokens)}</span>
                <span className="text-chart-2"><span className="text-muted-foreground">Out </span>{fmtNum(usage.outputTokens)}</span>
                <span className="text-chart-4"><span className="text-muted-foreground">Cache </span>{fmtNum(usage.cacheReadInputTokens)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Recent sessions list ──────────────────────────────────────────────────────
function SessionRow({ s }: { s: ActivitySession }) {
  const [expanded, setExpanded] = useState(false);
  const topLangs = Object.entries(s.languages).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l);
  const topTools = Object.entries(s.toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors flex items-start gap-3"
      >
        {expanded ? <ChevronDown className="size-3.5 text-muted-foreground mt-0.5 shrink-0" /> : <ChevronRight className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground truncate">
              {s.projectName ?? s.sessionId.slice(0, 8)}
            </span>
            {topLangs.length > 0 && (
              <div className="flex gap-1">
                {topLangs.map(l => (
                  <span key={l} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{l}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {s.startTime && <span>{timeAgo(s.startTime)}</span>}
            {s.durationMinutes && <span><Clock className="size-3 inline mr-0.5" />{s.durationMinutes}m</span>}
            <span><MessageSquare className="size-3 inline mr-0.5" />{s.userMessageCount} msgs</span>
            {s.gitCommits > 0 && <span className="text-chart-2"><GitCommit className="size-3 inline mr-0.5" />{s.gitCommits} commits</span>}
            {s.linesAdded > 0 && <span className="text-chart-1">+{fmtNum(s.linesAdded)} lines</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-sidebar/30 space-y-3">
          {s.firstPrompt && (
            <p className="text-[11px] text-muted-foreground/80 italic line-clamp-2">
              &ldquo;{s.firstPrompt.slice(0, 200)}{s.firstPrompt.length > 200 ? "…" : ""}&rdquo;
            </p>
          )}
          <div className="flex flex-wrap gap-4 text-[11px]">
            <span><span className="text-muted-foreground">Tokens in/out: </span>
              {fmtNum(s.inputTokens)} / {fmtNum(s.outputTokens)}</span>
            {(s.filesModified ?? 0) > 0 && <span>{s.filesModified} files modified</span>}
            {(s.linesRemoved ?? 0) > 0 && <span className="text-chart-5">-{fmtNum(s.linesRemoved)} lines</span>}
            {s.toolErrors > 0 && <span className="text-chart-5">{s.toolErrors} tool errors</span>}
            {(s.userInterruptions ?? 0) > 0 && (
              <span className={(s.userInterruptions ?? 0) > 3 ? "text-chart-3 font-medium" : "text-muted-foreground"}>
                {s.userInterruptions} interruption{(s.userInterruptions ?? 0) !== 1 ? "s" : ""}
                {(s.userInterruptions ?? 0) > 3 ? " ⚠" : ""}
              </span>
            )}
            {s.usesTaskAgent && <span className="text-chart-2">Task Agent</span>}
            {s.usesMcp && <span className="text-chart-4">MCP</span>}
            {s.usesWebSearch && <span className="text-chart-4">Web Search</span>}
            {s.durationMinutes && s.linesAdded > 0 && (
              <span className="text-muted-foreground/60">
                {Math.round(s.linesAdded / s.durationMinutes)} lines/min
              </span>
            )}
          </div>
          {topTools.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {topTools.map(([tool, count]) => (
                <span key={tool} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded">
                  {tool}: {String(count)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Horizontal bar helper ─────────────────────────────────────────────────────
function HBar({ label, value, max, colorClass, sub }: { label: string; value: number; max: number; colorClass: string; sub?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-36 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-1.5 relative">
        <div className={`${colorClass} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-8 text-right shrink-0">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground/60 w-16 shrink-0">{sub}</span>}
    </div>
  );
}

// ── Session Quality (Facets) ──────────────────────────────────────────────────
function FacetRow({ s }: { s: FacetSession }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors flex items-start gap-3"
      >
        {expanded ? <ChevronDown className="size-3.5 text-muted-foreground mt-0.5 shrink-0" /> : <ChevronRight className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              s.outcome === "fully_achieved" ? "border-chart-2/40 text-chart-2 bg-chart-2/10" :
              s.outcome === "mostly_achieved" ? "border-chart-1/40 text-chart-1 bg-chart-1/10" :
              s.outcome === "partially_achieved" ? "border-chart-3/40 text-chart-3 bg-chart-3/10" :
              "border-chart-5/40 text-chart-5 bg-chart-5/10"
            }`}>
              {outcomeLabel(s.outcome)}
            </span>
            <span className={`text-[10px] ${helpfulnessColor(s.helpfulness)}`}>
              {helpfulnessLabel(s.helpfulness)}
            </span>
            {s.sessionType && (
              <span className="text-[10px] text-muted-foreground/50">{s.sessionType.replace(/_/g, " ")}</span>
            )}
          </div>
          {s.goal && (
            <p className="text-xs text-muted-foreground truncate">{s.goal}</p>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-sidebar/30 space-y-2">
          {s.briefSummary && (
            <p className="text-[11px] text-muted-foreground/80">{s.briefSummary}</p>
          )}
          {s.frictionDetail && (
            <p className="text-[11px] text-chart-3/80 italic">
              ⚠ {s.frictionDetail.slice(0, 200)}{s.frictionDetail.length > 200 ? "…" : ""}
            </p>
          )}
          {Object.keys(s.frictionCounts).length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {Object.entries(s.frictionCounts).map(([k, v]) => (
                <span key={k} className="text-[10px] bg-chart-5/10 text-chart-5 px-2 py-0.5 rounded">
                  {k.replace(/_/g, " ")}: {v}
                </span>
              ))}
            </div>
          )}
          {s.satisfiedCount > 0 || s.dissatisfiedCount > 0 ? (
            <div className="text-[11px] text-muted-foreground">
              Satisfaction: <span className="text-chart-2">{s.satisfiedCount} ✓</span>
              {s.dissatisfiedCount > 0 && <span className="text-chart-5 ml-2">{s.dissatisfiedCount} ✗</span>}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SessionQualitySection({ data }: { data: FacetsResponse }) {
  const { aggregate, sessions } = data;
  if (!aggregate || sessions.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 text-center">
        <Award className="size-8 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No session quality data yet</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          Generated from <code className="bg-muted px-1 rounded">~/.claude/usage-data/facets/</code>
        </p>
      </div>
    );
  }

  const maxOutcome = Math.max(...Object.values(aggregate.outcomeCounts), 1);
  const maxFriction = aggregate.topFriction[0]?.count ?? 1;

  const outcomeOrder = ["fully_achieved", "mostly_achieved", "partially_achieved", "not_achieved", "unclear_from_transcript"];
  const sortedOutcomes = outcomeOrder
    .filter(k => aggregate.outcomeCounts[k])
    .map(k => [k, aggregate.outcomeCounts[k]] as [string, number]);
  const rest = Object.entries(aggregate.outcomeCounts).filter(([k]) => !outcomeOrder.includes(k));
  const allOutcomes = [...sortedOutcomes, ...rest];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outcome distribution */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Outcome Distribution</h4>
          {allOutcomes.map(([outcome, count]) => (
            <HBar
              key={outcome}
              label={outcomeLabel(outcome)}
              value={count}
              max={maxOutcome}
              colorClass={outcomeColor(outcome)}
            />
          ))}
          {aggregate.satisfactionRate !== null && (
            <div className="pt-2 border-t border-border text-[11px] text-muted-foreground">
              User satisfaction rate: <span className="text-chart-2 font-medium">{aggregate.satisfactionRate}%</span>
              <span className="ml-2 opacity-50">({aggregate.satisfiedTotal} satisfied, {aggregate.dissatisfiedTotal} dissatisfied)</span>
            </div>
          )}
        </div>

        {/* Friction types */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Top Friction Points</h4>
          {aggregate.topFriction.slice(0, 6).map(({ type, count }) => (
            <HBar
              key={type}
              label={type.replace(/_/g, " ")}
              value={count}
              max={maxFriction}
              colorClass="bg-chart-5/60"
            />
          ))}
          {aggregate.topFriction.length === 0 && (
            <p className="text-xs text-muted-foreground">No friction events recorded</p>
          )}
        </div>
      </div>

      {/* Session list */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Analyzed Sessions ({sessions.length})
        </h4>
        <div className="space-y-2">
          {sessions.map((s) => (
            <FacetRow key={s.sessionId} s={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tool Analytics (Conversations) ───────────────────────────────────────────
function ToolAnalyticsSection({ data }: { data: ConversationsResponse }) {
  const { aggregate, sessions } = data;
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!aggregate || sessions.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 text-center">
        <Wrench className="size-8 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No conversation data found</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          Parses <code className="bg-muted px-1 rounded">~/.claude/projects/</code> JSONL files
        </p>
      </div>
    );
  }

  const maxTool = aggregate.topTools[0]?.count ?? 1;
  const toolColors = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top tools aggregate */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Top Tools (All Time)</h4>
          {aggregate.topTools.map(({ name, count }, i) => {
            const pct = Math.round((count / aggregate.totalToolCalls) * 100);
            return (
              <HBar
                key={name}
                label={name}
                value={count}
                max={maxTool}
                colorClass={toolColors[i % toolColors.length]}
                sub={`${pct}%`}
              />
            );
          })}
          <div className="pt-2 border-t border-border text-[11px] text-muted-foreground">
            {fmtNum(aggregate.totalToolCalls)} total calls ·{" "}
            {aggregate.totalErrors} errors ·{" "}
            <span className={aggregate.errorRate > 5 ? "text-chart-5" : "text-chart-2"}>
              {aggregate.errorRate.toFixed(1)}% error rate
            </span>
          </div>
        </div>

        {/* Conversations */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Recent Conversations ({sessions.length})
          </h4>
          <div className="space-y-2">
            {sessions.slice(0, 8).map((s) => (
              <div key={s.sessionId} className="rounded border border-border overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === s.sessionId ? null : s.sessionId)}
                  className="w-full text-left px-3 py-2 hover:bg-accent/30 transition-colors flex items-center gap-2 text-[11px]"
                >
                  {expanded === s.sessionId ? <ChevronDown className="size-3 text-muted-foreground shrink-0" /> : <ChevronRight className="size-3 text-muted-foreground shrink-0" />}
                  <span className="font-medium text-foreground truncate flex-1">
                    {s.projectName ?? s.sessionId.slice(0, 8)}
                  </span>
                  <span className="text-muted-foreground shrink-0">{s.messageCount} msgs</span>
                  {s.errorCount > 0 && (
                    <span className="text-chart-5 shrink-0">{s.errorCount} err</span>
                  )}
                </button>
                {expanded === s.sessionId && (
                  <div className="border-t border-border px-3 py-2 bg-sidebar/30 text-[10px] space-y-1.5">
                    {s.cwd && <div className="text-muted-foreground/60 font-mono truncate">{s.cwd}</div>}
                    <div className="flex gap-2 flex-wrap">
                      {s.topTools.map(({ name, count: c }) => (
                        <span key={name} className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          {name}: {c}
                        </span>
                      ))}
                    </div>
                    <div className="text-muted-foreground">
                      R:{s.fileOps.read} W:{s.fileOps.write} E:{s.fileOps.edit} file ops
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cost Tracker ──────────────────────────────────────────────────────────────
function CostSection({ data }: { data: CostResponse }) {
  const knownModels = data.perModel.filter(m => m.estimatedCostUSD !== null);
  if (knownModels.length === 0) return null;

  return (
    <div className="bg-chart-4/5 border border-chart-4/20 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="size-4 text-chart-4" />
          <h4 className="text-sm font-semibold text-foreground">Estimated Cost</h4>
        </div>
        <div className="text-xl font-bold text-chart-4">
          ~${data.totalCostUSD.toFixed(2)}
        </div>
      </div>
      <div className="space-y-2 mb-3">
        {knownModels.map((m) => (
          <div key={m.model} className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{fmtModelName(m.model)}</span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground/60">{fmtNum(m.inputTokens + m.outputTokens)} tok</span>
              <span className="font-medium text-foreground">${(m.estimatedCostUSD ?? 0).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/50">{data.disclaimer}</p>
    </div>
  );
}

// ── Billing Block Widget ──────────────────────────────────────────────────────
function BillingBlockWidget({ data }: { data: BillingBlock }) {
  if (!data.active || !data.tokensUsed) return null;
  const elapsed = data.minutesElapsed ?? 0;
  const pct = Math.min((elapsed / 300) * 100, 100);
  const barColor = pct > 90 ? "bg-chart-5" : pct > 70 ? "bg-chart-3" : "bg-chart-2";
  const textColor = pct > 90 ? "text-chart-5" : pct > 70 ? "text-chart-3" : "text-chart-2";

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ZapIcon className={`size-3.5 ${textColor}`} />
          <span className="text-xs font-semibold text-foreground">Current 5h Billing Block</span>
        </div>
        <span className={`text-sm font-bold ${textColor}`}>~${(data.estimatedCostUSD ?? 0).toFixed(2)}</span>
      </div>
      <div className="bg-muted rounded-full h-1.5 mb-2">
        <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{elapsed}m elapsed</span>
        <span>{fmtNum(data.tokensUsed ?? 0)} tokens</span>
        <span>{data.minutesRemaining ?? 0}m remaining</span>
      </div>
      {data.breakdown && (
        <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground/60">
          <span>In: {fmtNum(data.breakdown.input)}</span>
          <span>Out: {fmtNum(data.breakdown.output)}</span>
          <span>Cache: {fmtNum(data.breakdown.cacheRead)}</span>
        </div>
      )}
    </div>
  );
}

// ── Prompt History ────────────────────────────────────────────────────────────
function PromptHistorySection({ data }: { data: HistoryResponse }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = search
    ? data.prompts.filter(p =>
        p.display.toLowerCase().includes(search.toLowerCase()) ||
        (p.projectName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : data.prompts;

  const maxCount = data.topProjects[0]?.count ?? 1;

  return (
    <div className="space-y-4">
      {/* Top projects */}
      {data.topProjects.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-2">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Most Active Projects
          </h4>
          {data.topProjects.slice(0, 5).map(({ path, name, count }) => (
            <HBar key={path} label={name} value={count} max={maxCount} colorClass="bg-chart-4" sub={`${count} prompts`} />
          ))}
        </div>
      )}

      {/* Prompt search + list */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Recent Prompts ({data.total})
          </h4>
          <input
            type="text"
            placeholder="Search prompts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ml-auto bg-background border border-border rounded-lg px-3 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring w-48"
          />
        </div>
        <div className="space-y-1">
          {filtered.slice(0, 30).map((p: HistoryPrompt, i) => {
            const key = `${p.sessionId}-${i}`;
            const isExpanded = expanded === key;
            return (
              <div key={key} className="bg-card border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(isExpanded ? null : key)}
                  className="w-full text-left px-3 py-2 hover:bg-accent/30 transition-colors flex items-start gap-2"
                >
                  <History className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{p.display || "(empty)"}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/60">
                      {p.projectName && <span>{p.projectName}</span>}
                      <span>{new Date(p.timestamp).toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-border px-3 py-2 bg-sidebar/30 text-[10px] text-muted-foreground/70 space-y-1">
                    <p className="break-words">{p.display}</p>
                    <p className="font-mono opacity-50">{p.project}</p>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground/60 text-center py-4">No matching prompts</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hook Event Feed ───────────────────────────────────────────────────────────
const TOOL_EMOJI: Record<string, string> = {
  Bash: "⚡", Read: "📖", Edit: "✏️", Write: "💾", Glob: "🔍",
  Grep: "🔎", Task: "🤖", WebFetch: "🌐", WebSearch: "🔍", TodoWrite: "📋",
};

function HookFeedSection({ events, hasHooks, autoCommit }: { events: HookEvent[]; hasHooks: boolean; autoCommit: boolean }) {
  if (!hasHooks) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 text-center">
        <ZapIcon className="size-8 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mb-2">Hooks not installed</p>
        <p className="text-[11px] text-muted-foreground/60 mb-3">
          Install hooks for real-time tool event streaming:
        </p>
        <code className="text-[11px] bg-muted px-2 py-1 rounded">npx claudedash hooks install</code>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 text-center">
        <ZapIcon className="size-8 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mb-2">Hooks installed — waiting for events</p>
        <p className="text-[11px] text-muted-foreground/60">
          Events appear here when Claude Code runs a tool call.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Live Tool Events ({events.length})
        </h4>
        {autoCommit && (
          <span className="text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
            Auto-commit: ON
          </span>
        )}
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {events.slice(0, 50).map((e) => (
          <div key={e.receivedAt} className="flex items-center gap-2 text-[11px] py-0.5">
            <span className="shrink-0">{TOOL_EMOJI[e.tool || ""] ?? "🔧"}</span>
            <span className="font-medium text-foreground">{e.tool || e.event}</span>
            {e.session && <span className="text-muted-foreground/50 font-mono">{e.session.slice(0, 6)}</span>}
            <span className="ml-auto text-muted-foreground/40 shrink-0">
              {new Date(e.receivedAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-xs text-muted-foreground/60">Waiting for events… Run a Claude Code session.</p>
        )}
      </div>
    </div>
  );
}

// ── Main ActivityView ─────────────────────────────────────────────────────────
export function ActivityView() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [facets, setFacets] = useState<FacetsResponse | null>(null);
  const [conversations, setConversations] = useState<ConversationsResponse | null>(null);
  const [cost, setCost] = useState<CostResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [billingBlock, setBillingBlock] = useState<BillingBlock | null>(null);
  const [hookEvents, setHookEvents] = useState<HookEvent[]>([]);
  const [hasHooks, setHasHooks] = useState(false);
  const [autoCommit, setAutoCommit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "quality" | "tools" | "history" | "hooks">("overview");

  const loadRef = useRef(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(false);
    try {
      const [usageRes, sessionsRes, facetsRes, convsRes, costRes, historyRes, billingRes, hookRes] = await Promise.all([
        fetch("/usage"),
        fetch("/activity/sessions"),
        fetch("/facets"),
        fetch("/conversations"),
        fetch("/cost"),
        fetch("/history"),
        fetch("/billing-block"),
        fetch("/hook/events"),
      ]);
      if (usageRes.ok) setStats(await usageRes.json() as UsageStats);
      if (sessionsRes.ok) {
        const d = await sessionsRes.json() as ActivitySessionsResponse;
        setSessions(d.sessions);
      }
      if (facetsRes.ok) setFacets(await facetsRes.json() as FacetsResponse);
      if (convsRes.ok) setConversations(await convsRes.json() as ConversationsResponse);
      if (costRes.ok) setCost(await costRes.json() as CostResponse);
      if (historyRes.ok) setHistory(await historyRes.json() as HistoryResponse);
      if (billingRes.ok) setBillingBlock(await billingRes.json() as BillingBlock);
      if (hookRes.ok) {
        const hookData = await hookRes.json() as { events: HookEvent[]; autoCommit?: boolean; hooksInstalled?: boolean };
        setHookEvents(hookData.events);
        setHasHooks(hookData.hooksInstalled ?? hookData.events.length > 0);
        setAutoCommit(hookData.autoCommit ?? false);
      }
      if (!usageRes.ok && !sessionsRes.ok) setError(true);
    } catch {
      setError(true);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  // Initial load + 30s polling interval
  useEffect(() => {
    void load(true);
    const interval = setInterval(() => { void load(false); }, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // SSE: re-fetch silently on file changes; append hook events directly
  useSSEEvents((data) => {
    if (data.type === "sessions") {
      void load(false);
    } else if (data.type === "hook") {
      const event = data as unknown as HookEvent;
      setHookEvents(prev => [event, ...prev].slice(0, 100));
      setHasHooks(true);
      // Debounce full reload for billing block update
      if (!loadRef.current) {
        loadRef.current = true;
        setTimeout(() => {
          loadRef.current = false;
          void load(false);
        }, 2000);
      }
    }
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <BarChart2 className="size-10 mx-auto mb-3 text-muted-foreground animate-pulse" />
          <p className="text-xs text-muted-foreground">Loading activity data…</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <BarChart2 className="size-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-2">No activity data found</p>
          <p className="text-xs text-muted-foreground/60">
            Start a Claude Code session to generate{" "}
            <code className="bg-muted px-1 rounded">~/.claude/stats-cache.json</code>
          </p>
        </div>
      </div>
    );
  }

  const totalLinesAdded = sessions.reduce((s, x) => s + (x.linesAdded ?? 0), 0);
  const totalGitCommits = sessions.reduce((s, x) => s + (x.gitCommits ?? 0), 0);
  const facetCount = facets?.sessions.length ?? 0;
  const convCount = conversations?.sessions.length ?? 0;

  const historyCount = history?.total ?? 0;
  const hookCount = hookEvents.length;

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "quality" as const, label: `Quality${facetCount > 0 ? ` (${facetCount})` : ""}` },
    { id: "tools" as const, label: `Tools${convCount > 0 ? ` (${convCount})` : ""}` },
    { id: "history" as const, label: `History${historyCount > 0 ? ` (${historyCount})` : ""}` },
    { id: "hooks" as const, label: `Hooks${hookCount > 0 ? ` (${hookCount})` : ""}` },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border bg-sidebar/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <BarChart2 className="size-4 text-chart-1" />
            <span className="text-sm font-medium">Activity</span>
            {stats.lastComputedDate && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Updated: {stats.lastComputedDate}
              </span>
            )}
          </div>
          {/* Tab switcher */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => void load(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <RefreshCw className="size-3" />
          Refresh
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-8 max-w-4xl mx-auto">

          {activeTab === "overview" && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="Total Sessions"
                  value={fmtNum(stats.totalSessions)}
                  sub={stats.firstSessionDate ? `Since ${new Date(stats.firstSessionDate).toLocaleDateString("en", { month: "short", day: "numeric" })}` : undefined}
                  colorClass="text-chart-1"
                />
                <StatCard label="Total Messages" value={fmtNum(stats.totalMessages)} colorClass="text-chart-2" />
                <StatCard
                  label="Lines Added"
                  value={totalLinesAdded > 0 ? `+${fmtNum(totalLinesAdded)}` : "—"}
                  colorClass="text-chart-4"
                />
                <StatCard
                  label="Git Commits"
                  value={totalGitCommits > 0 ? fmtNum(totalGitCommits) : "—"}
                  colorClass="text-chart-3"
                />
              </div>

              {/* Billing block widget */}
              {billingBlock && <BillingBlockWidget data={billingBlock} />}

              {/* Cost widget */}
              {cost && <CostSection data={cost} />}

              {/* Daily bar chart */}
              {stats.dailyActivity.length > 0 && (
                <div className="bg-card border border-border rounded-lg p-5">
                  <DailyBarChart data={stats.dailyActivity} />
                </div>
              )}

              {/* Hour heatmap + Model usage */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.keys(stats.hourCounts).length > 0 && (
                  <div className="bg-card border border-border rounded-lg p-5">
                    <HourHeatmap hourCounts={stats.hourCounts} />
                  </div>
                )}
                {Object.keys(stats.modelUsage).length > 0 && (
                  <div className="bg-card border border-border rounded-lg p-5">
                    <ModelTable modelUsage={stats.modelUsage} />
                  </div>
                )}
              </div>

              {/* Longest session */}
              {stats.longestSession && (
                <div className="bg-chart-4/5 border border-chart-4/20 rounded-lg px-5 py-4 flex items-center gap-4">
                  <Zap className="size-5 text-chart-4 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-foreground">Longest session: </span>
                    <span className="text-xs text-muted-foreground">
                      {stats.longestSession.messageCount} messages ·{" "}
                      {Math.round(stats.longestSession.duration / 60000)}m ·{" "}
                      {new Date(stats.longestSession.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Recent sessions */}
              {sessions.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Recent Sessions ({sessions.length})
                  </h4>
                  <div className="space-y-2">
                    {sessions.map((s) => (
                      <SessionRow key={s.sessionId} s={s} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "quality" && facets && (
            <SessionQualitySection data={facets} />
          )}

          {activeTab === "tools" && conversations && (
            <ToolAnalyticsSection data={conversations} />
          )}

          {activeTab === "history" && history && (
            <PromptHistorySection data={history} />
          )}

          {activeTab === "hooks" && (
            <HookFeedSection events={hookEvents} hasHooks={hasHooks} autoCommit={autoCommit} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
