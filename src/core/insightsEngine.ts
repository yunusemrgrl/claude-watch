import type {
  ComputedTask,
  LogEvent,
  ClaudeSession,
  PlanInsights,
  LiveInsights,
  TimelineDataPoint,
} from './types.js';

export function computePlanInsights(
  tasks: ComputedTask[],
  events: LogEvent[]
): PlanInsights {
  const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
  const failedTasks = tasks.filter((t) => t.status === 'FAILED').length;
  const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;
  const totalTasks = tasks.length;

  const successRate =
    completedTasks + failedTasks > 0
      ? completedTasks / (completedTasks + failedTasks)
      : 0;
  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

  // Compute timeline
  const timeline = computeTimeline(events);

  // Slice statistics
  const sliceStats: PlanInsights['sliceStats'] = {};
  const sliceMap = new Map<string, ComputedTask[]>();

  for (const task of tasks) {
    if (!sliceMap.has(task.slice)) {
      sliceMap.set(task.slice, []);
    }
    sliceMap.get(task.slice)!.push(task);
  }

  for (const [sliceName, sliceTasks] of sliceMap) {
    const total = sliceTasks.length;
    const completed = sliceTasks.filter((t) => t.status === 'DONE').length;
    const failed = sliceTasks.filter((t) => t.status === 'FAILED').length;
    const blocked = sliceTasks.filter((t) => t.status === 'BLOCKED').length;

    sliceStats[sliceName] = {
      name: sliceName,
      total,
      completed,
      failed,
      blocked,
      progress: total > 0 ? (completed / total) * 100 : 0,
    };
  }

  // Velocity calculation
  const velocity = computeVelocity(events);

  // Bottlenecks: tasks that block the most other tasks
  const bottlenecks = computeBottlenecks(tasks);

  return {
    summary: {
      totalTasks,
      completedTasks,
      failedTasks,
      blockedTasks,
      successRate,
      completionRate,
    },
    timeline,
    sliceStats,
    velocity,
    bottlenecks,
  };
}

export function computeLiveInsights(sessions: ClaudeSession[]): LiveInsights {
  const totalSessions = sessions.length;
  const activeSessions = sessions.filter((s) =>
    s.tasks.some((t) => t.status === 'in_progress')
  ).length;

  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  let pendingTasks = 0;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;

  for (const session of sessions) {
    totalTasks += session.tasks.length;
    completedTasks += session.tasks.filter((t) => t.status === 'completed').length;
    inProgressTasks += session.tasks.filter((t) => t.status === 'in_progress').length;
    pendingTasks += session.tasks.filter((t) => t.status === 'pending').length;

    if (session.tokenUsage) {
      totalInputTokens += session.tokenUsage.inputTokens;
      totalOutputTokens += session.tokenUsage.outputTokens;
      totalCacheCreation += session.tokenUsage.cacheCreationTokens;
      totalCacheRead += session.tokenUsage.cacheReadTokens;
    }
  }

  // Timeline for live mode - group by hour
  const timeline = computeLiveTimeline(sessions);

  // Top sessions by task count
  const topSessions = sessions
    .map((s) => ({
      id: s.id,
      taskCount: s.tasks.length,
      completedCount: s.tasks.filter((t) => t.status === 'completed').length,
      projectName: s.projectName,
      lastActivity: s.updatedAt,
    }))
    .sort((a, b) => b.taskCount - a.taskCount)
    .slice(0, 5);

  return {
    summary: {
      totalSessions,
      activeSessions,
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
    },
    timeline,
    tokenUsage: {
      total: totalInputTokens + totalOutputTokens + totalCacheCreation + totalCacheRead,
      input: totalInputTokens,
      output: totalOutputTokens,
      cacheCreation: totalCacheCreation,
      cacheRead: totalCacheRead,
    },
    topSessions,
  };
}

function computeTimeline(events: LogEvent[]): TimelineDataPoint[] {
  if (events.length === 0) return [];

  // Group events by day
  const dayMap = new Map<string, { completed: number; failed: number }>();

  for (const event of events) {
    const date = new Date(event.timestamp).toISOString().split('T')[0];
    if (!dayMap.has(date)) {
      dayMap.set(date, { completed: 0, failed: 0 });
    }
    const day = dayMap.get(date)!;
    if (event.status === 'DONE') day.completed++;
    if (event.status === 'FAILED') day.failed++;
  }

  // Convert to array and compute cumulative totals
  const sorted = Array.from(dayMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  let cumulativeCompleted = 0;
  let cumulativeFailed = 0;

  return sorted.map(([date, counts]) => {
    cumulativeCompleted += counts.completed;
    cumulativeFailed += counts.failed;
    return {
      timestamp: date,
      completed: cumulativeCompleted,
      failed: cumulativeFailed,
      total: cumulativeCompleted + cumulativeFailed,
    };
  });
}

function computeLiveTimeline(sessions: ClaudeSession[]): TimelineDataPoint[] {
  if (sessions.length === 0) return [];

  // Group by day based on session updatedAt
  const dayMap = new Map<string, { completed: number }>();

  for (const session of sessions) {
    const date = new Date(session.updatedAt).toISOString().split('T')[0];
    const completedCount = session.tasks.filter((t) => t.status === 'completed').length;

    if (!dayMap.has(date)) {
      dayMap.set(date, { completed: 0 });
    }
    dayMap.get(date)!.completed += completedCount;
  }

  const sorted = Array.from(dayMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  let cumulative = 0;
  return sorted.map(([date, counts]) => {
    cumulative += counts.completed;
    return {
      timestamp: date,
      completed: cumulative,
      failed: 0,
      total: cumulative,
    };
  });
}

function computeVelocity(events: LogEvent[]): {
  tasksPerHour: number;
  tasksPerDay: number;
  avgTaskDuration: number;
} {
  if (events.length === 0) {
    return { tasksPerHour: 0, tasksPerDay: 0, avgTaskDuration: 0 };
  }

  const completedEvents = events.filter((e) => e.status === 'DONE');
  if (completedEvents.length === 0) {
    return { tasksPerHour: 0, tasksPerDay: 0, avgTaskDuration: 0 };
  }

  // Find time range
  const timestamps = completedEvents.map((e) => new Date(e.timestamp).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const totalHours = (maxTime - minTime) / (1000 * 60 * 60);

  const tasksPerHour = totalHours > 0 ? completedEvents.length / totalHours : 0;
  const tasksPerDay = tasksPerHour * 24;

  // Average duration between consecutive tasks
  const sortedTimes = timestamps.sort((a, b) => a - b);
  let totalDuration = 0;
  for (let i = 1; i < sortedTimes.length; i++) {
    totalDuration += sortedTimes[i] - sortedTimes[i - 1];
  }
  const avgTaskDuration =
    sortedTimes.length > 1
      ? totalDuration / (sortedTimes.length - 1) / (1000 * 60)
      : 0;

  return {
    tasksPerHour: Math.round(tasksPerHour * 100) / 100,
    tasksPerDay: Math.round(tasksPerDay * 100) / 100,
    avgTaskDuration: Math.round(avgTaskDuration),
  };
}

function computeBottlenecks(
  tasks: ComputedTask[]
): Array<{ taskId: string; blocksCount: number; description: string }> {
  // Count how many tasks each task blocks
  const blockCount = new Map<string, number>();

  for (const task of tasks) {
    if (!blockCount.has(task.id)) {
      blockCount.set(task.id, 0);
    }

    // For each dependency, increment the count
    for (const dep of task.dependsOn) {
      blockCount.set(dep, (blockCount.get(dep) || 0) + 1);
    }
  }

  // Find tasks that block the most
  const bottlenecks = Array.from(blockCount.entries())
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([taskId, count]) => {
      const task = tasks.find((t) => t.id === taskId);
      return {
        taskId,
        blocksCount: count,
        description: task?.description || 'Unknown task',
      };
    });

  return bottlenecks;
}
