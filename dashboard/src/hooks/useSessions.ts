import { useState, useEffect, useCallback, useRef } from "react";
import type { ClaudeSession, SessionsResponse } from "@/types";

export function useSessions() {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(null);
  const [connected, setConnected] = useState(false);
  const selectedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSession?.id ?? null;
  }, [selectedSession]);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch("/sessions");
      if (!response.ok) return;
      const result: SessionsResponse = await response.json();
      setSessions(result.sessions);
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
  }, []);

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

  return { sessions, selectedSession, setSelectedSession, connected };
}
