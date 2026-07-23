import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// The Presence API can lag up to ~15s and we reconcile every 10s. Webhooks fill
// the gap: they arrive within a second or two, so the roster updates live.
const RECONCILE_INTERVAL_MS = 10_000;
const WS_RETRY_MS = 2_000;
const MAX_ROOMS = 10;
const MAX_FEED = 50;
// Presence data can trail reality by up to ~15s. Within this window we trust the
// webhook (which is near-instant) over the presence snapshot, so a stale snapshot
// can't resurrect someone who just left or drop someone who just joined.
const PRESENCE_LAG_MS = 20_000;

// One participant as returned by GET /presence.
interface PresenceParticipant {
  room: string;
  id: string;
  userName: string;
  joinTime: string;
}

// GET /presence returns a map of room name -> currently present participants.
type PresenceResponse = Record<string, PresenceParticipant[]>;

// A live message pushed by our server over the WebSocket, one per webhook event.
interface WebhookMessage {
  type: "participant.joined" | "participant.left";
  room: string;
  session_id: string;
  user_name: string;
  joined_at: number;
  duration?: number;
}

// Normalized participant used in the roster, from either source.
interface RosterParticipant {
  sessionId: string;
  userName: string;
  room: string;
  joinTimeMs: number;
  // When a webhook last touched this entry (0 if it came only from presence).
  // Used so the reconcile won't override a recent webhook change with stale data.
  lastWebhookMs: number;
}

type Roster = Record<string, RosterParticipant[]>;

type EventSource = "webhook" | "presence";
type EventKind = "joined" | "left";

interface DerivedEvent {
  key: string;
  kind: EventKind;
  source: EventSource;
  room: string;
  userName: string;
  at: string;
}

type WsStatus = "connecting" | "live" | "closed";

function rosterKey(room: string, sessionId: string): string {
  return `${room}:${sessionId}`;
}

function rosterFromPresence(data: PresenceResponse): Roster {
  const roster: Roster = {};
  for (const [room, participants] of Object.entries(data)) {
    roster[room] = participants.map((p) => ({
      sessionId: p.id,
      userName: p.userName,
      room: p.room || room,
      joinTimeMs: Date.parse(p.joinTime),
      lastWebhookMs: 0,
    }));
  }
  return roster;
}

/**
 * Hybrid presence + webhooks demo.
 *
 * This is the pattern we recommend when you need a live roster:
 * - Presence API for the snapshot on load and a full reconcile every 10s (the
 *   authoritative safety net).
 * - Webhooks (participant.joined / participant.left) pushed from our server over
 *   a WebSocket for the fast "in between" updates.
 *
 * The domain API key and webhook hmac live on the server (see server/index.ts).
 * The browser only calls /api/presence and connects to /ws.
 */
export function PresencePanel(): ReactElement {
  const [roster, setRoster] = useState<Roster>({});
  const [events, setEvents] = useState<DerivedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastReconcile, setLastReconcile] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");

  // Mirror of roster for diffing during reconcile, kept in sync after each render.
  const rosterRef = useRef<Roster>({});
  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  // Skip event logging on the first reconcile (the initial snapshot); only report
  // changes after we start watching, like a webhook consumer would.
  const seededRef = useRef(false);
  const eventIdRef = useRef(0);
  // session keys (room:sessionId) a webhook removed recently, with the time. Used
  // to stop a stale presence snapshot from resurrecting someone who just left.
  const recentlyLeftRef = useRef<Map<string, number>>(new Map());

  const pushEvent = useCallback(
    (source: EventSource, kind: EventKind, room: string, userName: string) => {
      const at = new Date().toISOString();
      eventIdRef.current += 1;
      const event: DerivedEvent = {
        key: `${String(eventIdRef.current)}`,
        kind,
        source,
        room,
        userName,
        at,
      };
      setEvents((prev) => [event, ...prev].slice(0, MAX_FEED));
    },
    [],
  );

  // Presence reconcile: the authoritative full snapshot.
  const reconcile = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/presence", {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setError(`Presence request failed: HTTP ${String(res.status)}.`);
        return;
      }
      const data = (await res.json()) as PresenceResponse;
      const fresh = rosterFromPresence(data);
      const nowMs = Date.now();

      const freshByKey = new Map<string, RosterParticipant>();
      for (const list of Object.values(fresh)) {
        for (const p of list) freshByKey.set(rosterKey(p.room, p.sessionId), p);
      }
      const currentByKey = new Map<string, RosterParticipant>();
      for (const list of Object.values(rosterRef.current)) {
        for (const p of list) currentByKey.set(rosterKey(p.room, p.sessionId), p);
      }

      // Forget stale entries in the recently-left guard.
      for (const [key, leftMs] of recentlyLeftRef.current) {
        if (nowMs - leftMs > PRESENCE_LAG_MS) recentlyLeftRef.current.delete(key);
      }

      // Merge presence into the webhook-driven roster. Webhooks win for recent
      // changes: a stale presence snapshot must not resurrect someone a webhook
      // just removed, nor drop someone a webhook just added. Presence only
      // corrects drift older than the lag window.
      const merged = new Map<string, RosterParticipant>();
      for (const [key, cur] of currentByKey) {
        if (freshByKey.has(key)) {
          merged.set(key, cur); // present in both
        } else if (nowMs - cur.lastWebhookMs < PRESENCE_LAG_MS) {
          merged.set(key, cur); // presence lagging behind a recent webhook join
        } else if (seededRef.current) {
          pushEvent("presence", "left", cur.room, cur.userName); // real drift
        }
      }
      for (const [key, p] of freshByKey) {
        if (currentByKey.has(key)) continue;
        const leftMs = recentlyLeftRef.current.get(key);
        if (leftMs !== undefined && nowMs - leftMs < PRESENCE_LAG_MS) continue; // just left
        merged.set(key, p);
        if (seededRef.current) pushEvent("presence", "joined", p.room, p.userName);
      }

      seededRef.current = true;

      const next: Roster = {};
      for (const p of merged.values()) {
        (next[p.room] ??= []).push(p);
      }
      setRoster(next);
      setLastReconcile(new Date().toLocaleTimeString());
      setError(null);
    } catch (err) {
      setError(
        `Could not reach the presence backend: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }, [pushEvent]);

  // Apply one live webhook message to the roster.
  const handleWebhook = useCallback(
    (msg: WebhookMessage) => {
      const key = rosterKey(msg.room, msg.session_id);
      const nowMs = Date.now();
      if (msg.type === "participant.joined") {
        recentlyLeftRef.current.delete(key);
        setRoster((prev) => {
          const list = prev[msg.room] ?? [];
          if (list.some((p) => p.sessionId === msg.session_id)) {
            // Already present: just refresh the webhook recency stamp.
            return {
              ...prev,
              [msg.room]: list.map((p) =>
                p.sessionId === msg.session_id
                  ? { ...p, lastWebhookMs: nowMs }
                  : p,
              ),
            };
          }
          return {
            ...prev,
            [msg.room]: [
              ...list,
              {
                sessionId: msg.session_id,
                userName: msg.user_name,
                room: msg.room,
                joinTimeMs: msg.joined_at * 1000,
                lastWebhookMs: nowMs,
              },
            ],
          };
        });
        pushEvent("webhook", "joined", msg.room, msg.user_name);
      } else if (msg.type === "participant.left") {
        recentlyLeftRef.current.set(key, nowMs);
        setRoster((prev) => {
          const list = prev[msg.room];
          if (!list) return prev;
          const next = list.filter((p) => p.sessionId !== msg.session_id);
          const copy = { ...prev };
          if (next.length > 0) copy[msg.room] = next;
          else delete copy[msg.room];
          return copy;
        });
        pushEvent("webhook", "left", msg.room, msg.user_name);
      }
    },
    [pushEvent],
  );

  // Initial snapshot + periodic reconcile.
  useEffect(() => {
    void reconcile();
    const interval = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [reconcile]);

  // WebSocket for live webhook events, with auto-reconnect.
  const wsUrl = useMemo(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }, []);

  useEffect(() => {
    let unmounted = false;
    let socket: WebSocket | null = null;
    let retry: number | undefined;

    const connect = (): void => {
      setWsStatus("connecting");
      socket = new WebSocket(wsUrl);
      socket.onopen = () => setWsStatus("live");
      socket.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(ev.data as string) as WebhookMessage;
          handleWebhook(msg);
        } catch {
          // ignore malformed messages
        }
      };
      socket.onclose = () => {
        setWsStatus("closed");
        if (!unmounted) retry = window.setTimeout(connect, WS_RETRY_MS);
      };
      socket.onerror = () => socket?.close();
    };
    connect();

    return () => {
      unmounted = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [wsUrl, handleWebhook]);

  const rankedRooms = useMemo(() => {
    return Object.entries(roster)
      .map(([room, participants]) => ({
        room,
        participants,
        latestJoin: participants.reduce(
          (max, p) => Math.max(max, p.joinTimeMs),
          0,
        ),
      }))
      .sort((a, b) => b.latestJoin - a.latestJoin)
      .slice(0, MAX_ROOMS);
  }, [roster]);

  const wsLabel =
    wsStatus === "live"
      ? "live"
      : wsStatus === "connecting"
        ? "connecting…"
        : "closed (retrying)";

  return (
    <div
      id="presencePanel"
      style={{
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: 12,
        marginTop: 16,
        maxWidth: 640,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <strong>Presence + webhooks: {MAX_ROOMS} most recent rooms</strong>
        <button type="button" onClick={() => void reconcile()}>
          Refresh now
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Webhook stream: <strong>{wsLabel}</strong> · Presence reconcile every 10s
        · Last reconcile: {lastReconcile ?? "never"}
      </div>

      {error && (
        <div id="presenceError" style={{ color: "#b00", marginTop: 8 }}>
          {error}
        </div>
      )}

      <h4 style={{ marginBottom: 4 }}>Rooms</h4>
      {rankedRooms.length === 0 ? (
        <div style={{ color: "#666" }}>
          No active rooms on this domain yet. Join a room to see presence here.
        </div>
      ) : (
        rankedRooms.map((r) => (
          <div key={r.room} style={{ marginBottom: 8 }}>
            <div>
              <strong>{r.room}</strong> ({r.participants.length})
            </div>
            <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
              {r.participants.map((p) => (
                <li key={p.sessionId}>
                  {p.userName || "(no name)"} : {p.sessionId} : joined{" "}
                  {new Date(p.joinTimeMs).toLocaleTimeString()}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <h4 style={{ marginBottom: 4 }}>Join/left events</h4>
      {events.length === 0 ? (
        <div style={{ color: "#666" }}>
          Watching for changes. Join or leave a room to see events appear.
        </div>
      ) : (
        <ul
          id="presenceEvents"
          style={{
            margin: 0,
            paddingLeft: 20,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {events.map((e) => (
            <li key={e.key}>
              {new Date(e.at).toLocaleTimeString()} :{" "}
              <span
                style={{
                  fontSize: 11,
                  padding: "0 4px",
                  borderRadius: 4,
                  background: e.source === "webhook" ? "#e6f0ff" : "#eee",
                }}
              >
                {e.source}
              </span>{" "}
              {e.room} : <strong>{e.kind}</strong> {e.userName || "(no name)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
