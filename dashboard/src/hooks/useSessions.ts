import { useState, useEffect, useCallback, useRef } from "react";
import type { ClaudeSession, SessionsResponse } from "@/types";

export function useSessions(showAll = false) {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionCounts, setSessionCounts] = useState<{ total: number; filtered: number } | null>(null);
  const selectedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSession?.id ?? null;
  }, [selectedSession]);

  const fetchSessions = useCallback(async () => {
    try {
      const url = showAll ? "/sessions?days=all" : "/sessions";
      const response = await fetch(url);
      if (!response.ok) return;
      const result: SessionsResponse & { total?: number; filtered?: number } = await response.json();
      setSessions(result.sessions);
      if (result.total != null) {
        setSessionCounts({ total: result.total, filtered: result.filtered ?? result.sessions.length });
      }
      const currentId = selectedSessionIdRef.current;
      if (!currentId && result.sessions.length > 0) {
        setSelectedSession(result.sessions[0]);
      } else if (currentId) {
        const updated = result.sessions.find((s) => s.id === currentId);
        if (updated) setSelectedSession(updated);
      }
    } catch {
      // ignore
    }
  }, [showAll]);

  useEffect(() => {
    fetchSessions();
    const es = new EventSource("/events/");
    es.onopen = () => setConnected(true);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "sessions") fetchSessions();
      } catch {
        // ignore
      }
    };
    es.onerror = () => setConnected(false);
    return () => {
      es.close();
      setConnected(false);
    };
  }, [fetchSessions]);

  return { sessions, selectedSession, setSelectedSession, connected, sessionCounts };
}
