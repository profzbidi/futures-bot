// hooks/useRankingWS.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { RankingItem, WS } from "@/lib/api";

type ConnectionState = "connecting" | "open" | "closed" | "error";

export function useRankingWS() {
  const [ranking, setRanking]       = useState<RankingItem[]>([]);
  const [connState, setConnState]   = useState<ConnectionState>("connecting");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const wsRef   = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;

    const url = `${WS}/ws/ranking`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnState("open");
      if (retryRef.current) clearTimeout(retryRef.current);
    };

    ws.onmessage = (evt) => {
      try {
        const data: RankingItem[] = JSON.parse(evt.data);
        setRanking(data);
        setLastUpdated(new Date());
      } catch (_) {}
    };

    ws.onclose = () => {
      setConnState("closed");
      retryRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      setConnState("error");
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { ranking, connState, lastUpdated };
}
