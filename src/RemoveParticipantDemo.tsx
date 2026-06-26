import "./styles.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DailyProvider,
  useAppMessage,
  useCallFrame,
  useDaily,
  useDailyEvent,
  useParticipantIds,
} from "@daily-co/daily-react";
import type {
  DailyEventObject,
  DailyEventObjectAppMessage,
  DailyEventObjectCustomButtonClick,
} from "@daily-co/daily-js";

// Demo: backend-driven participant removal + mute in Daily Prebuilt.
//
// The "admin" joins with a NON-admin token, so Prebuilt's built-in "Remove from
// call..." menu and its rejoin notice never appear. A custom tray button opens a
// small panel that drives eject + mute through the dev-server proxy (see
// vite.config.ts), which holds the Daily API key. There is also a cooperative
// "ask to mute" path over sendAppMessage.
//
// Run two windows:
//   admin: http://localhost:3000/?demo=remove-participant&admin=true
//   guest: http://localhost:3000/?demo=remove-participant
// Add &builtinAdmin=true to an admin window to SEE the built-in menu we are avoiding.

interface SessionInfo {
  roomName: string;
  roomUrl: string;
  token: string;
}

// An https-hosted raw SVG is required: Prebuilt loads it inside an iframe.
// Iconify serves real image/svg+xml (svgrepo /show/ pages are HTML, not SVG).
const ADMIN_BUTTON_ICON =
  "https://api.iconify.design/mdi/account-cog.svg?width=32&height=32";

const params = () => new URLSearchParams(window.location.search);
const isAdmin = () => params().get("admin") === "true";
const isBuiltinAdmin = () => params().get("builtinAdmin") === "true";

// A stable per-tab user id. Ban works by user_id, so without a stable id an
// ejected guest just rejoins on refresh with a fresh random id.
//
// Use sessionStorage, NOT localStorage: localStorage is shared across every tab
// on this origin, so the admin and guest tabs would get the SAME user_id and
// ejecting one would eject both. sessionStorage is scoped to a single tab but
// still survives a refresh in that tab, which is exactly what the ban test needs.
function getUserId(): string {
  const key = "daily-demo-uid";
  let id = window.sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(key, id);
  }
  return id;
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as unknown;
}

type DemoAppMessage = DailyEventObjectAppMessage<{ event: string }>;

const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  width: 320,
  maxHeight: "70vh",
  overflowY: "auto",
  padding: 16,
  background: "white",
  border: "1px solid #ccc",
  borderRadius: 8,
  boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
  textAlign: "left",
  zIndex: 1000,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  padding: "8px 0",
  borderBottom: "1px solid #eee",
};

function DemoControls() {
  const callObject = useDaily();
  const [open, setOpen] = useState(false);
  const admin = isAdmin();

  const logEvent = useCallback((evt: DailyEventObject) => {
    if ("action" in evt) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`logEvent: ${evt.action}`, evt);
    } else {
      console.log("logEvent:", evt);
    }
  }, []);

  // Reactive list of everyone but the local participant.
  const remoteIds = useParticipantIds({
    filter: "remote",
    onParticipantLeft: logEvent,
    onParticipantUpdated: logEvent,
  });

  // The custom tray button only exists on the admin window, but gate anyway.
  useDailyEvent(
    "custom-button-click",
    useCallback((ev: DailyEventObjectCustomButtonClick) => {
      if (ev.button_id === "admin-panel") setOpen((o) => !o);
    }, [])
  );

  // Receive the cooperative "please mute" request and self-mute. Runs in every
  // window (admin and guest) because everyone loads this same component.
  const sendAppMessage = useAppMessage({
    onAppMessage: useCallback(
      (ev: DemoAppMessage) => {
        logEvent(ev);
        if (ev.data.event === "please-mute") {
          callObject?.setLocalAudio(false);
        }
      },
      [callObject, logEvent]
    ),
  });

  const nameFor = (id: string) => {
    const name = callObject?.participants()[id]?.user_name;
    return name ? name : id;
  };

  const eject = (id: string) => {
    // Pass the stable user_id so the ban survives a page refresh.
    const userId = callObject?.participants()[id]?.user_id;
    void post("/api/eject", { sessionId: id, userId, ban: true });
  };

  if (!admin || !open) return null;

  return (
    <div style={panelStyle}>
      <h3 style={{ marginTop: 0 }}>Manage participants</h3>
      <p style={{ fontSize: 12, color: "#666", marginTop: 0 }}>
        This admin has no Daily <code>canAdmin</code>. Eject and mute run through
        the backend; &quot;ask to mute&quot; is cooperative.
      </p>
      {remoteIds.length === 0 && <p>No other participants yet.</p>}
      {remoteIds.map((id) => (
        <div key={id} style={rowStyle}>
          <div style={{ width: "100%" }}>
            <strong>{nameFor(id)}</strong>
            <br />
            <code style={{ fontSize: 11 }}>{id}</code>
          </div>
          <button onClick={() => eject(id)}>Eject + ban</button>
          <button onClick={() => void post("/api/mute", { sessionId: id, canSend: ["video"] })}>
            Mute mic
          </button>
          <button onClick={() => void post("/api/mute", { sessionId: id, canSend: ["audio"] })}>
            Stop camera
          </button>
          <button
            onClick={() =>
              void post("/api/mute", { sessionId: id, canSend: ["audio", "video"] })
            }
          >
            Restore
          </button>
          <button onClick={() => sendAppMessage({ event: "please-mute" }, id)}>
            Ask to mute
          </button>
        </div>
      ))}
    </div>
  );
}

export function RemoveParticipantDemo() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [banned, setBanned] = useState(false);
  const admin = isAdmin();

  // Fetch a room + non-admin token from the backend proxy on mount.
  useEffect(() => {
    let cancelled = false;
    post("/api/session", {
      admin,
      builtinAdmin: isBuiltinAdmin(),
      userId: getUserId(),
    })
      .then((info) => {
        if (cancelled) return;
        // The backend refuses to issue a token to an ejected + banned user.
        if (info && typeof info === "object" && "error" in info) {
          setBanned(true);
          return;
        }
        setSession(info as SessionInfo);
      })
      .catch((err) => console.error("session error", err));
    return () => {
      cancelled = true;
    };
  }, [admin]);

  const callFrame = useCallFrame({
    // @ts-expect-error will be fixed in the next release (matches Prebuilt.tsx)
    parentElRef: wrapperRef,
    options: {
      url: session?.roomUrl,
      token: session?.token,
      dailyConfig: {
        useDevicePreferenceCookies: true,
      },
      iframeStyle: {
        width: "100%",
        height: "80vh",
      },
      // Only the admin window gets the tray button that opens the panel.
      ...(admin
        ? {
            customTrayButtons: {
              "admin-panel": {
                iconPath: ADMIN_BUTTON_ICON,
                label: "Manage participants",
                tooltip: "Remove or mute participants",
                visualState: "default" as const,
              },
            },
          }
        : {}),
    },
    shouldCreateInstance: useCallback(
      () => Boolean(wrapperRef.current) && Boolean(session),
      [session]
    ),
  });

  useEffect(() => {
    if (!callFrame || !session) return;
    // @ts-expect-error debugging
    window.callObject = callFrame;
    callFrame.join().catch((err) => {
      console.error("Error joining call", err);
    });
  }, [callFrame, session]);

  if (banned) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <h2 style={{ color: "#c00" }}>You were removed from the call</h2>
        <p>
          Your session was ended and you cannot rejoin. Contact the host if this
          was unexpected.
        </p>
      </div>
    );
  }

  return (
    <DailyProvider callObject={callFrame}>
      <div ref={wrapperRef} />
      <DemoControls />
    </DailyProvider>
  );
}
