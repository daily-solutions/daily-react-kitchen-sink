import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";

// Poll no more than once every 15s (per the Presence API docs); data can lag up
// to 15s behind reality.
const POLL_INTERVAL_MS = 15_000;
const MAX_ROOMS = 10;
const MAX_FEED = 50;

// One participant as returned by GET /presence.
interface PresenceParticipant {
  room: string;
  id: string;
  userId: string | null;
  userName: string;
  mtgSessionId: string;
  joinTime: string;
  duration: number;
}

// GET /presence returns a map of room name -> currently present participants.
type PresenceResponse = Record<string, PresenceParticipant[]>;

interface PresenceRoom {
  room: string;
  participants: PresenceParticipant[];
  latestJoin: number;
}

type PresenceEventType = "joined" | "left";

interface DerivedEvent {
  key: string;
  type: PresenceEventType;
  room: string;
  userName: string;
  at: string;
}

// A stable key for one participant in one room, so the same id in two rooms is
// treated as two distinct people.
function participantKey(p: PresenceParticipant): string {
  return `${p.room}:${p.id}`;
}

/**
 * Presence API demo.
 *
 * Instead of consuming participant.joined / participant.left webhooks, this
 * polls the /presence REST endpoint every 15s, renders a live roster of the 10
 * most recently active rooms, and derives synthetic "joined" / "left" events by
 * diffing each snapshot against the previous one. That diff is the direct
 * replacement for the two webhooks.
 *
 * The domain API key is never in the browser: the request goes to /api/presence,
 * which the Vite dev server proxies to api.daily.co with the Authorization
 * header added server-side (see vite.config.ts).
 */
export function PresencePanel(): ReactElement {
  const [rooms, setRooms] = useState<PresenceRoom[]>([]);
  const [events, setEvents] = useState<DerivedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Previous snapshot, keyed by `${room}:${id}`, used to diff for join/left.
  const prevRef = useRef<Map<string, PresenceParticipant>>(new Map());
  // Skip event generation on the first successful poll: we only report changes
  // that happen after we start listening, the same as a webhook consumer would.
  const seededRef = useRef(false);

  const fetchPresence = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch("/api/presence", {
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 400) {
          setError(
            "Auth failed (check DAILY_API_KEY in .env.local, then restart the dev server).",
          );
        } else if (res.status === 429) {
          setError("Rate limited by the Presence API. Polling will retry.");
        } else {
          setError(`Presence request failed: HTTP ${res.status}.`);
        }
        return;
      }

      const data = (await res.json()) as PresenceResponse;

      // Flatten the current snapshot into a keyed map.
      const currentMap = new Map<string, PresenceParticipant>();
      for (const participants of Object.values(data)) {
        for (const p of participants) {
          currentMap.set(participantKey(p), p);
        }
      }

      // Diff against the previous snapshot to derive joined/left events.
      if (seededRef.current) {
        const now = new Date().toISOString();
        const newEvents: DerivedEvent[] = [];

        for (const [key, p] of currentMap) {
          if (!prevRef.current.has(key)) {
            console.log("presence: joined", { room: p.room, participant: p });
            newEvents.push({
              key: `${key}:joined:${now}`,
              type: "joined",
              room: p.room,
              userName: p.userName,
              at: now,
            });
          }
        }
        for (const [key, p] of prevRef.current) {
          if (!currentMap.has(key)) {
            console.log("presence: left", { room: p.room, participant: p });
            newEvents.push({
              key: `${key}:left:${now}`,
              type: "left",
              room: p.room,
              userName: p.userName,
              at: now,
            });
          }
        }

        if (newEvents.length > 0) {
          setEvents((prev) => [...newEvents, ...prev].slice(0, MAX_FEED));
        }
      } else {
        seededRef.current = true;
      }

      prevRef.current = currentMap;

      // Rank rooms by their most recent participant joinTime, keep the top 10.
      const rankedRooms: PresenceRoom[] = Object.entries(data)
        .map(([room, participants]) => ({
          room,
          participants,
          latestJoin: participants.reduce(
            (max, p) => Math.max(max, new Date(p.joinTime).getTime()),
            0,
          ),
        }))
        .sort((a, b) => b.latestJoin - a.latestJoin)
        .slice(0, MAX_ROOMS);

      setRooms(rankedRooms);
      setLastUpdated(new Date().toLocaleTimeString());
      setError(null);
    } catch (err) {
      setError(
        `Could not reach the Presence proxy: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPresence();
    const interval = setInterval(() => void fetchPresence(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchPresence]);

  return (
    <div
      id="presencePanel"
      style={{
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: 12,
        marginTop: 16,
        maxWidth: 600,
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
        <strong>Presence API: {MAX_ROOMS} most recent rooms</strong>
        <button type="button" onClick={() => void fetchPresence()}>
          Refresh presence
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Polls /api/presence every 15s. Last updated: {lastUpdated ?? "never"}
        {loading ? " (refreshing…)" : ""}
      </div>

      {error && (
        <div id="presenceError" style={{ color: "#b00", marginTop: 8 }}>
          {error}
        </div>
      )}

      <h4 style={{ marginBottom: 4 }}>Rooms</h4>
      {rooms.length === 0 ? (
        <div style={{ color: "#666" }}>
          No active rooms on this domain yet. Join a room to see presence here.
        </div>
      ) : (
        rooms.map((r) => (
          <div key={r.room} style={{ marginBottom: 8 }}>
            <div>
              <strong>{r.room}</strong> ({r.participants.length})
            </div>
            <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
              {r.participants.map((p) => (
                <li key={p.id}>
                  {p.userName || "(no name)"} : {p.id} : joined{" "}
                  {new Date(p.joinTime).toLocaleTimeString()} : {p.duration}s
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <h4 style={{ marginBottom: 4 }}>Derived join/left events</h4>
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
              {new Date(e.at).toLocaleTimeString()} : {e.room} :{" "}
              <strong>{e.type}</strong> {e.userName || "(no name)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
