import "./styles.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DailyProvider,
  useAppMessage,
  useCallFrame,
  useDaily,
  useDailyEvent,
  useParticipantCounts,
  useParticipantIds,
} from "@daily-co/daily-react";
import {
  DailyEventObject,
  DailyEventObjectAppMessage,
  DailyEventObjectCustomButtonClick,
} from "@daily-co/daily-js";

// The Prebuilt room this demo joins. The room name is the last path segment.
const ROOM_URL = "https://hush.daily.co/demo";
const ROOM_NAME = "demo";

// DEMO ONLY: VITE_ prefixed env vars are bundled into the browser, so this
// API key is visible to anyone who opens dev tools. A production app must
// proxy the eject call through its own backend. The API key must never
// reach the browser. Never log this value.
const DAILY_API_KEY = import.meta.env.VITE_DAILY_API_KEY as string;

// Owner token for the moderator, guest token for a second participant.
// Both carry a user_id, which the ban needs. Join with ?prebuilt=true for
// the moderator, or ?prebuilt=true&guest=true for a bannable guest.
const isGuest = new URLSearchParams(window.location.search).has("guest");
const MEETING_TOKEN = (
  isGuest
    ? import.meta.env.VITE_DAILY_GUEST_TOKEN
    : import.meta.env.VITE_DAILY_MODERATOR_TOKEN
) as string;

const MODERATION_ICON_URL =
  "https://cdn.jsdelivr.net/npm/lucide-static@0.462.0/icons/shield-ban.svg";

// One source of truth for the tray button. Note updateCustomTrayButtons()
// replaces the whole set, so keep every button in this map.
const MODERATION_TRAY_BUTTONS = {
  moderation: {
    iconPath: MODERATION_ICON_URL,
    label: "Moderation",
    tooltip: "Remove and ban a participant",
    // Not "sidebar-open": with that state Prebuilt binds the button to the
    // sidebar natively, and that binding stops working after
    // setCustomIntegrations() re-publishes the panel (verified in Chrome
    // with daily-js 0.92.2). With "default" every click fires
    // custom-button-click and we open the sidebar ourselves.
    visualState: "default",
  },
} as const;

interface PanelParticipant {
  sessionId: string;
  userId: string;
  userName: string;
  local: boolean;
  bannable: boolean;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Builds the HTML that renders inside the sidebar integration iframe.
// That iframe runs with sandbox="allow-scripts" on an opaque origin. Its
// window.parent is the Prebuilt iframe (a daily.co origin), NOT our app.
// So the panel reaches our React app with window.top.postMessage and the
// app listens for "message" events on window. Daily documents no
// parent-to-integration message bridge, so updates flow the other way:
// we re-call setCustomIntegrations() with fresh HTML.
const buildPanelHtml = (
  participants: PanelParticipant[],
  status: string
): string => {
  const rows = participants
    .map((p) => {
      const name = escapeHtml(p.userName);
      if (p.local) {
        return `<li><span class="name">${name}</span> <span class="note">(you)</span></li>`;
      }
      if (!p.bannable) {
        // No user_id on their meeting token means the eject endpoint has
        // nothing to ban them by. Show that instead of a silent no-op.
        return `<li><span class="name">${name}</span> <span class="note">No user_id on their token. Cannot ban.</span></li>`;
      }
      return `<li><span class="name">${name}</span> <button
        data-user-id="${escapeHtml(p.userId)}"
        data-session-id="${escapeHtml(p.sessionId)}"
        data-user-name="${escapeHtml(p.userName)}"
      >Remove and ban</button></li>`;
    })
    .join("\n");
  return `<!doctype html>
<html>
<head>
<style>
  body { font-family: sans-serif; font-size: 14px; margin: 12px; color: #1f2d3d; }
  h2 { font-size: 15px; margin: 0 0 8px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid #e6e9ec; }
  .name { font-weight: 600; overflow-wrap: anywhere; }
  .note { color: #6b7785; font-size: 12px; }
  .status { margin-top: 10px; font-size: 12px; color: #6b7785; }
  button { background: #e02020; color: #fff; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
</style>
</head>
<body>
<h2>Moderation</h2>
<ul>${rows}</ul>
<p class="status">${escapeHtml(status)}</p>
<script>
  for (const btn of document.querySelectorAll("button[data-user-id]")) {
    btn.addEventListener("click", function () {
      window.top.postMessage(
        {
          type: "moderation-ban",
          userId: this.dataset.userId,
          sessionId: this.dataset.sessionId,
          userName: this.dataset.userName,
        },
        "*"
      );
    });
  }
</script>
</body>
</html>`;
};

// Everything the moderator panel needs: keeps the sidebar integration in
// sync with the participant list, opens it from the custom tray button,
// and turns a panel click into the REST eject call with ban: true.
const ModerationPanel = () => {
  const callObject = useDaily();
  const participantIds = useParticipantIds();
  const [status, setStatus] = useState(
    "Click a button to remove and ban that participant."
  );

  const logEvent = useCallback((evt: DailyEventObject) => {
    if ("action" in evt) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`logEvent: ${evt.action}`, evt);
    } else {
      console.log("logEvent:", evt);
    }
  }, []);

  useDailyEvent("sidebar-view-changed", logEvent);

  useDailyEvent(
    "custom-button-click",
    useCallback(
      (evt: DailyEventObjectCustomButtonClick) => {
        logEvent(evt);
        if (evt.button_id === "moderation" && callObject) {
          // Toggle: close the panel when it is already open.
          callObject
            .getSidebarView()
            .then((view) => {
              callObject.setSidebarView(
                view === "moderation" ? null : "moderation"
              );
            })
            .catch((err) =>
              console.error("Error opening moderation sidebar", err)
            );
        }
      },
      [callObject, logEvent]
    )
  );

  // Re-publish the panel whenever the participant list or the status line
  // changes, so the sidebar content stays current.
  useEffect(() => {
    if (!callObject || callObject.meetingState() !== "joined-meeting") return;
    const participants = Object.values(callObject.participants()).map(
      (p): PanelParticipant => ({
        sessionId: p.session_id,
        userId: p.user_id,
        userName: p.user_name || "Guest",
        local: p.local,
        // When a participant joins without a meeting token user_id,
        // daily-js reports their user_id as equal to their session_id.
        // The eject endpoint only bans by token user_id, so that
        // participant cannot be banned.
        bannable: !p.local && p.user_id !== p.session_id,
      })
    );
    try {
      callObject.setCustomIntegrations({
        moderation: {
          label: "Moderation",
          location: "sidebar",
          controlledBy: "owners",
          srcdoc: buildPanelHtml(participants, status),
          sandbox: "allow-scripts",
          loading: "lazy",
        },
      });
      // Re-assert the tray button too. Re-publishing the integration
      // deactivates the button that was registered at frame creation
      // (clicks stop firing custom-button-click; verified in Chrome with
      // daily-js 0.92.2), and this brings it back.
      callObject.updateCustomTrayButtons(MODERATION_TRAY_BUTTONS);
    } catch (err) {
      console.error("Error updating moderation integration", err);
    }
  }, [callObject, participantIds, status]);

  const banParticipant = useCallback(
    async (userId: string, userName: string) => {
      setStatus(`Removing and banning ${userName}...`);
      const url = `https://api.daily.co/v1/rooms/${ROOM_NAME}/eject`;
      // Ban works by user_ids only. Passing session ids ejects without
      // banning, which is not what this demo shows.
      const body = { user_ids: [userId], ban: true };
      logEvent({ action: "moderation-eject-request", url, body });
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            // DEMO ONLY: see the warning at DAILY_API_KEY above. Move this
            // call to a backend before shipping anything real.
            Authorization: `Bearer ${DAILY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const result: unknown = await response.json();
        logEvent({
          action: "moderation-eject-response",
          status: response.status,
          result,
        });
        if (response.ok) {
          setStatus(`Removed and banned ${userName}.`);
        } else {
          setStatus(`Eject failed with status ${response.status}. See console.`);
        }
      } catch (err) {
        console.error("Error calling eject", err);
        setStatus("Eject request failed. See console.");
      }
    },
    [logEvent]
  );

  // The panel posts to window.top, which is this window.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data: unknown = e.data;
      if (typeof data !== "object" || data === null) return;
      const msg = data as {
        type?: string;
        userId?: string;
        userName?: string;
      };
      if (msg.type !== "moderation-ban") return;
      if (!msg.userId) return;
      banParticipant(msg.userId, msg.userName ?? "participant").catch((err) =>
        console.error("Error handling ban request", err)
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [banParticipant]);

  return <span> Moderation: {status}</span>;
};

const App = () => {
  const callObject = useDaily();

  // @ts-expect-error debugging
  window.callObject = callObject;

  const participantCount = useParticipantCounts();

  const logEvent = useCallback((evt: DailyEventObject) => {
    if ("action" in evt) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`logEvent: ${evt.action}`, evt);
    } else {
      console.log("logEvent:", evt);
    }
  }, []);

  useParticipantIds({
    onParticipantJoined: logEvent,
    onParticipantLeft: logEvent,
    onParticipantUpdated: logEvent,
  });

  type PrebuiltAppMessage = DailyEventObjectAppMessage<{
    date: string;
    event: "chat-msg"; // There's other events too
    message: string;
    name: string;
    room: string;
  }>;

  const sendAppMessage = useAppMessage({
    onAppMessage: useCallback((message: PrebuiltAppMessage) => {
      console.log(message);
      switch (message.data.event) {
        case "chat-msg":
          console.log("Chat message:", message.data.message);
          break;
        default:
          console.log("Unknown event:", message.data.event);
      }
    }, []),
  });

  return (
    <>
      <button
        onClick={() =>
          sendAppMessage({
            event: "chat-msg",
            date: Date.now().toString(),
            message: "Hello from button!",
            name: "button",
            room: "main-room",
          })
        }
      >
        Send message
      </button>
      <span>{participantCount.present} participants</span>
      <ModerationPanel />
    </>
  );
};

export const Prebuilt = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const callFrame = useCallFrame({
    // @ts-expect-error will be fixed in the next release
    parentElRef: wrapperRef,
    options: {
      dailyConfig: {
        useDevicePreferenceCookies: true,
      },
      url: ROOM_URL,
      token: MEETING_TOKEN,
      customIntegrations: {
        moderation: {
          label: "Moderation",
          location: "sidebar",
          controlledBy: "owners",
          srcdoc: buildPanelHtml([], "Waiting to join the meeting..."),
          sandbox: "allow-scripts",
          loading: "lazy",
        },
      },
      customTrayButtons: MODERATION_TRAY_BUTTONS,
      iframeStyle: {
        width: "100%",
        height: "80vh",
      },
      userData: {
        avatar: "https://www.svgrepo.com/show/532036/cloud-rain-alt.svg",
      },
    },
    shouldCreateInstance: useCallback(() => Boolean(wrapperRef.current), []),
  });

  useEffect(() => {
    if (!callFrame) return;
    callFrame?.join().catch((err) => {
      console.error("Error joining call", err);
    });
  }, [callFrame]);
  return (
    <DailyProvider callObject={callFrame}>
      <div ref={wrapperRef} />
      <App />
    </DailyProvider>
  );
};
