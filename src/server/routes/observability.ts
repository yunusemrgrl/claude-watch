import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { readSessions } from '../../core/todoReader.js';
import { detectWorktrees, enrichWorktreeStatus } from '../../core/worktreeDetector.js';
import { mapTasksToWorktrees } from '../../core/worktreeMapper.js';
import type { EventEmitter } from 'events';
import type { WatchEvent } from '../watcher.js';
import { DEFAULT_SOURCE, getSourceLayout, type SourceProvider } from '../../platform/source.js';

export interface ObservabilityRouteOptions {
  claudeDir: string;
  emitter?: EventEmitter;
  source?: SourceProvider;
}

export async function observabilityRoutes(fastify: FastifyInstance, opts: ObservabilityRouteOptions): Promise<void> {
  const { claudeDir, emitter, source = DEFAULT_SOURCE } = opts;
  const sourceLayout = getSourceLayout(source, claudeDir);

  // ── Server-side caches ────────────────────────────────────────────────────
  // /history: mtime-based — only re-parse history.jsonl when file changes
  let historyCache: { mtime: number; result: unknown } | null = null;

  // /billing-block: watcher-invalidated + 60s TTL fallback
  let billingCache: { expireAt: number; result: unknown } | null = null;

  // /conversations: mtime-based — key is the max mtime across the 20 sampled files
  let conversationsCache: { maxMtime: number; result: unknown } | null = null;

  // Invalidate billing cache when any session file changes (watcher fires 'sessions' events)
  emitter?.on('change', (event: WatchEvent) => {
    if (event.type === 'sessions') billingCache = null;
  });

  // GET /usage — reads ~/.claude/stats-cache.json (written by Claude Code)
  fastify.get('/usage', async (_req, reply) => {
    const statsPath = sourceLayout.statsCachePath;
    if (!existsSync(statsPath)) {
      return reply.code(404).send({
        error: 'Usage data not found',
        hint: 'stats-cache.json not found in Claude directory. Run a Claude Code session to generate it.',
      });
    }
    try {
      const raw = readFileSync(statsPath, 'utf8');
      const stats = JSON.parse(raw) as Record<string, unknown>;
      // Return last 7 days of dailyActivity
      const dailyActivity = Array.isArray(stats.dailyActivity) ? stats.dailyActivity : [];
      const last7Days = dailyActivity.slice(-7);
      return {
        totalSessions: stats.totalSessions ?? 0,
        totalMessages: stats.totalMessages ?? 0,
        firstSessionDate: stats.firstSessionDate ?? null,
        longestSession: stats.longestSession ?? null,
        hourCounts: stats.hourCounts ?? {},
        modelUsage: stats.modelUsage ?? {},
        dailyActivity: last7Days,
        lastComputedDate: stats.lastComputedDate ?? null,
      };
    } catch {
      return reply.code(500).send({ error: 'Failed to read stats-cache.json' });
    }
  });

  // GET /activity/sessions — reads ~/.claude/usage-data/session-meta/*.json
  fastify.get('/activity/sessions', async (_req, reply) => {
    const sessionMetaDir = join(sourceLayout.usageDataDir, 'session-meta');
    if (!existsSync(sessionMetaDir)) {
      return reply.code(404).send({
        error: 'Session metadata not found',
        hint: 'usage-data/session-meta directory not found.',
      });
    }
    try {
      const files = readdirSync(sessionMetaDir).filter(f => f.endsWith('.json'));
      const sessions: unknown[] = [];
      for (const file of files) {
        try {
          const raw = readFileSync(join(sessionMetaDir, file), 'utf8');
          const meta = JSON.parse(raw) as Record<string, unknown>;
          sessions.push({
            sessionId: meta.session_id ?? basename(file, '.json'),
            projectPath: meta.project_path ?? null,
            projectName: meta.project_path ? basename(String(meta.project_path)) : null,
            startTime: meta.start_time ?? null,
            durationMinutes: meta.duration_minutes ?? null,
            userMessageCount: meta.user_message_count ?? 0,
            assistantMessageCount: meta.assistant_message_count ?? 0,
            toolCounts: meta.tool_counts ?? {},
            languages: meta.languages ?? {},
            gitCommits: meta.git_commits ?? 0,
            gitPushes: meta.git_pushes ?? 0,
            inputTokens: meta.input_tokens ?? 0,
            outputTokens: meta.output_tokens ?? 0,
            linesAdded: meta.lines_added ?? 0,
            linesRemoved: meta.lines_removed ?? 0,
            filesModified: meta.files_modified ?? 0,
            firstPrompt: meta.first_prompt ?? null,
            toolErrors: meta.tool_errors ?? 0,
            usesMcp: meta.uses_mcp ?? false,
            usesWebSearch: meta.uses_web_search ?? false,
            usesTaskAgent: meta.uses_task_agent ?? false,
            userInterruptions: meta.user_interruptions ?? 0,
          });
        } catch {
          // skip malformed files
        }
      }
      // Sort by startTime descending, return last 20
      sessions.sort((a, b) => {
        const aTime = (a as Record<string, unknown>).startTime as string ?? '';
        const bTime = (b as Record<string, unknown>).startTime as string ?? '';
        return bTime.localeCompare(aTime);
      });
      return { sessions: sessions.slice(0, 20), total: sessions.length };
    } catch {
      return reply.code(500).send({ error: 'Failed to read session metadata' });
    }
  });

  // GET /history — reads ~/.claude/history.jsonl (full cross-project prompt history)
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/history', async (_req, reply) => {
    const historyPath = sourceLayout.historyPath;
    if (!existsSync(historyPath)) {
      return { prompts: [], topProjects: [] };
    }
    try {
      const limitParam = _req.query.limit ? parseInt(_req.query.limit, 10) : 50;
      const offsetParam = _req.query.offset ? parseInt(_req.query.offset, 10) : 0;
      const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 500);
      const offset = isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);

      // Return cached parse when file hasn't changed (offset 0 / default limit only)
      const mtime = statSync(historyPath).mtimeMs;
      if (historyCache && historyCache.mtime === mtime && offset === 0 && limit === 50) {
        return historyCache.result;
      }

      const raw = readFileSync(historyPath, 'utf8');
      const lines = raw.split('\n').filter(l => l.trim());

      interface HistoryEntry {
        display: string;
        timestamp: number;
        project: string;
        sessionId: string;
      }

      const allEntries: HistoryEntry[] = [];
      const projectCounts: Record<string, number> = {};

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          const display = typeof entry.display === 'string' ? entry.display : '';
          const project = typeof entry.project === 'string' ? entry.project : '';
          const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : '';
          const timestamp = typeof entry.timestamp === 'number' ? entry.timestamp : 0;

          allEntries.push({ display: display.slice(0, 200), timestamp, project, sessionId });
          if (project) {
            projectCounts[project] = (projectCounts[project] ?? 0) + 1;
          }
        } catch { /* skip bad lines */ }
      }

      // Sort by timestamp desc, paginate
      allEntries.sort((a, b) => b.timestamp - a.timestamp);
      const prompts = allEntries.slice(offset, offset + limit).map(e => ({
        display: e.display,
        timestamp: new Date(e.timestamp).toISOString(),
        project: e.project,
        projectName: e.project ? basename(e.project) : null,
        sessionId: e.sessionId,
      }));

      // Top 10 projects by frequency
      const topProjects = Object.entries(projectCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, count]) => ({ path, name: basename(path), count }));

      const result = { prompts, topProjects, total: allEntries.length, offset, limit };
      if (offset === 0 && limit === 50) historyCache = { mtime, result };
      return result;
    } catch {
      return reply.code(500).send({ error: 'Failed to read history.jsonl' });
    }
  });

  // GET /facets — reads ~/.claude/usage-data/facets/*.json (AI-generated session analysis)
  fastify.get('/facets', async (_req, reply) => {
    const facetsDir = join(sourceLayout.usageDataDir, 'facets');
    if (!existsSync(facetsDir)) {
      return { sessions: [], aggregate: null };
    }
    try {
      const files = readdirSync(facetsDir).filter(f => f.endsWith('.json'));
      const sessions: unknown[] = [];
      const outcomeCounts: Record<string, number> = {};
      const helpfulnessCounts: Record<string, number> = {};
      const frictionTotals: Record<string, number> = {};
      let satisfiedTotal = 0;
      let dissatisfiedTotal = 0;

      for (const file of files) {
        try {
          const raw = readFileSync(join(facetsDir, file), 'utf8');
          const f = JSON.parse(raw) as Record<string, unknown>;
          const sessionId = (f.session_id as string | undefined) ?? basename(file, '.json');

          // Aggregate outcome
          const outcome = (f.outcome as string | undefined) ?? 'unknown';
          outcomeCounts[outcome] = (outcomeCounts[outcome] ?? 0) + 1;

          // Aggregate helpfulness
          const helpfulness = (f.claude_helpfulness as string | undefined) ?? 'unknown';
          helpfulnessCounts[helpfulness] = (helpfulnessCounts[helpfulness] ?? 0) + 1;

          // Aggregate friction
          const friction = (f.friction_counts as Record<string, number> | undefined) ?? {};
          for (const [k, v] of Object.entries(friction)) {
            frictionTotals[k] = (frictionTotals[k] ?? 0) + v;
          }

          // Aggregate satisfaction
          const satisfaction = (f.user_satisfaction_counts as Record<string, number> | undefined) ?? {};
          for (const [k, v] of Object.entries(satisfaction)) {
            if (k.includes('satisfied') && !k.includes('dis')) satisfiedTotal += v;
            else if (k.includes('dis')) dissatisfiedTotal += v;
          }

          sessions.push({
            sessionId,
            outcome,
            helpfulness,
            sessionType: f.session_type ?? null,
            goal: f.underlying_goal ?? null,
            briefSummary: f.brief_summary ?? null,
            frictionDetail: f.friction_detail ?? null,
            frictionCounts: f.friction_counts ?? {},
            goalCategories: f.goal_categories ?? {},
            primarySuccess: f.primary_success ?? null,
            satisfiedCount: satisfaction[Object.keys(satisfaction).find(k => k.includes('satisfied') && !k.includes('dis')) ?? ''] ?? 0,
            dissatisfiedCount: satisfaction[Object.keys(satisfaction).find(k => k.includes('dis')) ?? ''] ?? 0,
          });
        } catch {
          // skip malformed files
        }
      }

      // Sort top friction
      const topFriction = Object.entries(frictionTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count }));

      const totalResponses = satisfiedTotal + dissatisfiedTotal;
      return {
        sessions,
        aggregate: {
          totalSessions: sessions.length,
          outcomeCounts,
          helpfulnessCounts,
          topFriction,
          satisfactionRate: totalResponses > 0 ? Math.round((satisfiedTotal / totalResponses) * 100) : null,
          satisfiedTotal,
          dissatisfiedTotal,
        },
      };
    } catch {
      return reply.code(500).send({ error: 'Failed to read facets data' });
    }
  });

  // GET /conversations — parses ~/.claude/projects/ JSONL files for tool analytics
  fastify.get('/conversations', async (_req, reply) => {
    const projectsDir = sourceLayout.projectsDir;
    if (!existsSync(projectsDir)) {
      return { sessions: [], aggregate: null };
    }
    try {
      interface ConvSession {
        sessionId: string;
        cwd: string | null;
        projectName: string | null;
        messageCount: number;
        toolCounts: Record<string, number>;
        topTools: { name: string; count: number }[];
        errorCount: number;
        fileOps: { read: number; write: number; edit: number };
      }
      const results: ConvSession[] = [];
      const globalToolCounts: Record<string, number> = {};
      let globalErrorCount = 0;

      // Find all JSONL files across project subdirs
      const projectDirs = readdirSync(projectsDir);
      const jsonlFiles: string[] = [];
      for (const pd of projectDirs) {
        const pdPath = join(projectsDir, pd);
        try {
          const entries = readdirSync(pdPath).filter(f => f.endsWith('.jsonl'));
          for (const e of entries) jsonlFiles.push(join(pdPath, e));
        } catch { /* not a dir */ }
      }

      // Sort by mtime desc, take last 20
      const mtimes = new Map<string, number>();
      jsonlFiles.sort((a, b) => {
        try {
          const ma = statSync(a).mtimeMs; mtimes.set(a, ma);
          const mb = statSync(b).mtimeMs; mtimes.set(b, mb);
          return mb - ma;
        } catch { return 0; }
      });
      const top20 = jsonlFiles.slice(0, 20);
      const maxMtime = top20.reduce((m, f) => Math.max(m, mtimes.get(f) ?? 0), 0);
      if (conversationsCache && conversationsCache.maxMtime === maxMtime) {
        return conversationsCache.result;
      }

      // Process up to 20 most recent
      for (const filePath of top20) {
        try {
          const raw = readFileSync(filePath, 'utf8');
          const lines = raw.split('\n').filter(l => l.trim());
          // Only read last 300 lines for performance
          const sample = lines.slice(-300);

          let cwd: string | null = null;
          let messageCount = 0;
          const toolCounts: Record<string, number> = {};
          let errorCount = 0;
          let readCount = 0, writeCount = 0, editCount = 0;

          for (const line of sample) {
            try {
              const msg = JSON.parse(line) as Record<string, unknown>;
              if (!cwd && msg.cwd) cwd = msg.cwd as string;
              if (msg.type === 'user' || msg.type === 'assistant') messageCount++;

              if (msg.type === 'assistant') {
                const content = (msg.message as Record<string, unknown> | undefined)?.content;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (typeof block === 'object' && block !== null) {
                      const b = block as Record<string, unknown>;
                      if (b.type === 'tool_use') {
                        const name = b.name as string;
                        toolCounts[name] = (toolCounts[name] ?? 0) + 1;
                        globalToolCounts[name] = (globalToolCounts[name] ?? 0) + 1;
                        if (name === 'Read') readCount++;
                        if (name === 'Write') writeCount++;
                        if (name === 'Edit' || name === 'str_replace_based_edit_tool') editCount++;
                      }
                    }
                  }
                }
              }

              if (msg.type === 'user') {
                const content = (msg.message as Record<string, unknown> | undefined)?.content;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (typeof block === 'object' && block !== null) {
                      const b = block as Record<string, unknown>;
                      if (b.type === 'tool_result' && b.is_error) {
                        errorCount++;
                        globalErrorCount++;
                      }
                    }
                  }
                }
              }
            } catch { /* skip bad line */ }
          }

          const topTools = Object.entries(toolCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

          const sessionId = basename(filePath, '.jsonl');
          results.push({
            sessionId,
            cwd,
            projectName: cwd ? basename(cwd) : null,
            messageCount,
            toolCounts,
            topTools,
            errorCount,
            fileOps: { read: readCount, write: writeCount, edit: editCount },
          });
        } catch { /* skip bad file */ }
      }

      const topGlobalTools = Object.entries(globalToolCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      const totalTools = Object.values(globalToolCounts).reduce((a, b) => a + b, 0);

      const convResult = {
        sessions: results,
        aggregate: {
          totalConversations: results.length,
          topTools: topGlobalTools,
          totalToolCalls: totalTools,
          totalErrors: globalErrorCount,
          errorRate: totalTools > 0 ? Math.round((globalErrorCount / totalTools) * 100) / 100 : 0,
        },
      };
      conversationsCache = { maxMtime, result: convResult };
      return convResult;
    } catch {
      return reply.code(500).send({ error: 'Failed to read conversations' });
    }
  });

  // GET /cost — estimates Claude API cost from stats-cache.json modelUsage
  fastify.get('/cost', async (_req, reply) => {
    const statsPath = sourceLayout.statsCachePath;
    if (!existsSync(statsPath)) {
      return reply.code(404).send({ error: 'stats-cache.json not found' });
    }
    // Pricing per million tokens: [input, output] in USD
    const PRICING: Record<string, [number, number]> = {
      'claude-opus-4': [15, 75],
      'claude-opus-4-5': [15, 75],
      'claude-sonnet-4': [3, 15],
      'claude-sonnet-4-5': [3, 15],
      'claude-sonnet-4-6': [3, 15],
      'claude-haiku-4': [0.25, 1.25],
      'claude-haiku-4-5': [0.25, 1.25],
      'claude-3-5-sonnet': [3, 15],
      'claude-3-5-sonnet-20241022': [3, 15],
      'claude-3-5-haiku': [0.8, 4],
      'claude-3-5-haiku-20241022': [0.8, 4],
      'claude-3-opus': [15, 75],
      'claude-3-sonnet': [3, 15],
      'claude-3-haiku': [0.25, 1.25],
    };
    try {
      const raw = readFileSync(statsPath, 'utf8');
      const stats = JSON.parse(raw) as Record<string, unknown>;
      const modelUsage = (stats.modelUsage ?? {}) as Record<string, {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadInputTokens?: number;
        cacheCreationInputTokens?: number;
      }>;

      let totalCostUSD = 0;
      const perModel = Object.entries(modelUsage).map(([model, usage]) => {
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        const cacheRead = usage.cacheReadInputTokens ?? 0;
        const cacheCreate = usage.cacheCreationInputTokens ?? 0;

        // Find pricing — try exact match then prefix match
        let pricing = PRICING[model];
        if (!pricing) {
          for (const [key, p] of Object.entries(PRICING)) {
            if (model.startsWith(key) || model.includes(key)) { pricing = p; break; }
          }
        }

        let estimatedCostUSD: number | null = null;
        if (pricing) {
          const [inPrice, outPrice] = pricing;
          // Cache read costs ~10% of input price; cache creation ~25%
          const cost = (inputTokens / 1_000_000) * inPrice
            + (outputTokens / 1_000_000) * outPrice
            + (cacheRead / 1_000_000) * (inPrice * 0.1)
            + (cacheCreate / 1_000_000) * (inPrice * 0.25);
          estimatedCostUSD = Math.round(cost * 100) / 100;
          totalCostUSD += cost;
        }

        return { model, inputTokens, outputTokens, cacheRead, cacheCreate, estimatedCostUSD };
      });

      return {
        totalCostUSD: Math.round(totalCostUSD * 100) / 100,
        perModel,
        disclaimer: 'Estimates only — check Anthropic console for actual billing',
      };
    } catch {
      return reply.code(500).send({ error: 'Failed to compute cost' });
    }
  });

  // GET /plans — reads ~/.claude/plans/*.md (Claude-generated plan documents)
  fastify.get('/plans', async () => {
    const plansDir = sourceLayout.plansDir;
    if (!existsSync(plansDir)) return { plans: [] };
    try {
      const files = readdirSync(plansDir).filter(f => f.endsWith('.md'));
      const plans = files.map(file => {
        const filePath = join(plansDir, file);
        try {
          const content = readFileSync(filePath, 'utf8');
          const mtime = statSync(filePath).mtime.toISOString();
          // Extract title from first `# ` heading
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1].trim() : file.replace('.md', '');
          const id = file.replace('.md', '');
          return { id, filename: file, title, createdAt: mtime, content };
        } catch { return null; }
      }).filter(Boolean);
      // Sort by mtime desc
      plans.sort((a, b) => {
        if (!a || !b) return 0;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      return { plans };
    } catch {
      return { plans: [] };
    }
  });

  // GET /billing-block — computes current 5-hour billing window token usage from JSONL
  fastify.get('/billing-block', async () => {
    const projectsDir = sourceLayout.projectsDir;
    if (!existsSync(projectsDir)) return { active: false };
    // Return cached result if still fresh (60s TTL)
    const now = Date.now();
    if (billingCache && billingCache.expireAt > now) return billingCache.result;
    try {
      const windowMs = 5 * 60 * 60 * 1000; // 5 hours
      const now = Date.now();
      const windowStart = now - windowMs;
      // Scan up to 10h back to find last block info when current window is idle
      const lookbackStart = now - 2 * windowMs;

      const SONNET_IN = 3, SONNET_OUT = 15; // per MTok (assume sonnet as baseline)
      const calcCost = (inp: number, out: number, cacheR: number, cacheC: number) =>
        Math.round(((inp / 1_000_000) * SONNET_IN + (out / 1_000_000) * SONNET_OUT +
          (cacheR / 1_000_000) * (SONNET_IN * 0.1) + (cacheC / 1_000_000) * (SONNET_IN * 0.25)) * 100) / 100;

      // Current window accumulators
      let cur_in = 0, cur_out = 0, cur_cC = 0, cur_cR = 0;
      let curOldest: number | null = null;
      // Last (previous) block accumulators
      let prev_in = 0, prev_out = 0, prev_cC = 0, prev_cR = 0;
      let prevOldest: number | null = null, prevNewest: number | null = null;

      const projectDirs = readdirSync(projectsDir);
      for (const pd of projectDirs) {
        const pdPath = join(projectsDir, pd);
        let entries: string[];
        try { entries = readdirSync(pdPath).filter(f => f.endsWith('.jsonl')); }
        catch { continue; }

        for (const entry of entries) {
          try {
            const raw = readFileSync(join(pdPath, entry), 'utf8');
            const lines = raw.split('\n').filter(l => l.trim());
            for (const line of lines) {
              try {
                const msg = JSON.parse(line) as Record<string, unknown>;
                if (msg.type !== 'assistant') continue;
                const ts = typeof msg.timestamp === 'string' ? new Date(msg.timestamp).getTime() : 0;
                if (!ts || ts < lookbackStart) continue;

                const message = msg.message as Record<string, unknown> | undefined;
                const usage = message?.usage as Record<string, number> | undefined;
                if (!usage) continue;

                const inp = usage.inputTokens ?? 0;
                const out = usage.outputTokens ?? 0;
                const cC = usage.cacheCreationInputTokens ?? 0;
                const cR = usage.cacheReadInputTokens ?? 0;

                if (ts >= windowStart) {
                  // Current 5h window
                  cur_in += inp; cur_out += out; cur_cC += cC; cur_cR += cR;
                  if (!curOldest || ts < curOldest) curOldest = ts;
                } else {
                  // Previous window (5-10h ago)
                  prev_in += inp; prev_out += out; prev_cC += cC; prev_cR += cR;
                  if (!prevOldest || ts < prevOldest) prevOldest = ts;
                  if (!prevNewest || ts > prevNewest) prevNewest = ts;
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
      }

      const tokensUsed = cur_in + cur_out + cur_cC + cur_cR;
      let billingResult: unknown;
      if (tokensUsed === 0) {
        const prevTokens = prev_in + prev_out + prev_cC + prev_cR;
        if (prevTokens > 0 && prevNewest) {
          billingResult = {
            active: false,
            lastBlockEndedAt: new Date(prevNewest + windowMs).toISOString(),
            lastBlockStartedAt: prevOldest ? new Date(prevOldest).toISOString() : undefined,
            lastBlockCostUSD: calcCost(prev_in, prev_out, prev_cR, prev_cC),
          };
        } else {
          billingResult = { active: false };
        }
      } else {
        const blockStart = curOldest ?? now;
        const minutesElapsed = Math.round((now - blockStart) / 60000);
        const minutesRemaining = Math.max(0, 300 - minutesElapsed);
        billingResult = {
          active: true,
          blockStart: new Date(blockStart).toISOString(),
          blockEnd: new Date(blockStart + windowMs).toISOString(),
          minutesElapsed,
          minutesRemaining,
          tokensUsed,
          breakdown: { input: cur_in, output: cur_out, cacheCreate: cur_cC, cacheRead: cur_cR },
          estimatedCostUSD: calcCost(cur_in, cur_out, cur_cR, cur_cC),
        };
      }
      billingCache = { expireAt: now + 60_000, result: billingResult };
      return billingResult;
    } catch {
      return { active: false };
    }
  });

  fastify.get('/worktrees', async () => {
    try {
      const raw = await detectWorktrees(process.cwd());
      const enriched = await Promise.all(raw.map(w => enrichWorktreeStatus(w)));
      const sessions = readSessions(claudeDir);
      return { worktrees: mapTasksToWorktrees(sessions, enriched) };
    } catch {
      return { worktrees: [] };
    }
  });
}
