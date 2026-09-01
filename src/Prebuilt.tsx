import "./styles.css";
import { useCallback, useEffect, useRef } from "react";
import Bowser from "bowser";
import {
  DailyProvider,
  useAppMessage,
  useCallFrame,
  useDaily,
  useParticipantCounts,
  useParticipantIds,
} from "@daily-co/daily-react";
import {
  DailyEventObject,
  DailyEventObjectAppMessage,
} from "@daily-co/daily-js";

// --- Tablet layout detection (T-3598) ---------------------------------------
// Focusmate reports that Prebuilt drops to active-speaker plus a paginated
// member strip on tablets instead of showing all 8 participants at once.
//
// That behavior is one branch, not a tile budget. call-ui App.tsx replaces the
// entire desktop <Call /> with <MobileView /> when its isMobile flag is set,
// and MobileCall defaults to pageSize = 3. The flag is set purely from the
// user agent: Bowser platform.type of "mobile" or "tablet", or isIOSMobile().
// There is no tablet-specific cap on tile count anywhere in call-ui.
//
// The consequence worth testing: because the swap happens above GridView,
// activeSpeakerMode: false and layoutConfig.grid.maxTilesPerPage never reach
// the grid on a device classified as a tablet. Both are set on the frame below
// so you can see for yourself whether they take effect.
//
// This panel mirrors call-ui's detection with the same Bowser version (2.11.0)
// rather than approximating it, so the verdict matches what Prebuilt computes.

const isIOSMobile = () => {
  const browser = Bowser.parse(navigator.userAgent);
  return (
    browser.platform?.vendor === "Apple" &&
    ["mobile", "tablet"].includes(browser.platform?.type ?? "") &&
    navigator.maxTouchPoints > 0 &&
    typeof TouchEvent !== "undefined"
  );
};

const LayoutDetection = () => {
  const parsed = Bowser.parse(navigator.userAgent);
  const platformType = parsed.platform?.type ?? "unknown";
  // The exact condition from call-ui components/App/App.tsx.
  const isMobile =
    ["mobile", "tablet"].includes(platformType) || isIOSMobile();

  return (
    <div id="layoutDetection">
      <h3>What Prebuilt sees</h3>
      <table>
        <tbody>
          <tr><td>userAgent</td><td id="ua">{navigator.userAgent}</td></tr>
          <tr><td>maxTouchPoints</td><td>{navigator.maxTouchPoints}</td></tr>
          <tr><td>platform.type</td><td id="platformType">{platformType}</td></tr>
          <tr><td>platform.vendor</td><td>{parsed.platform?.vendor ?? "unknown"}</td></tr>
          <tr><td>os.name</td><td>{parsed.os?.name ?? "unknown"}</td></tr>
          <tr><td>isIOSMobile()</td><td>{String(isIOSMobile())}</td></tr>
          <tr><td>screen</td><td>{window.screen.width}x{window.screen.height}</td></tr>
        </tbody>
      </table>
      <p id="verdict">
        {isMobile
          ? "MOBILE UI: Prebuilt renders MobileView, 1 speaker page then 3 tiles per page. activeSpeakerMode and maxTilesPerPage are ignored, because the swap happens above GridView."
          : "DESKTOP UI: Prebuilt renders the grid. maxTilesPerPage applies and tile count is limited only by available space."}
      </p>
      <p>
        Caveat: an emulated user agent is not proof about real hardware. Safari
        on iPadOS requests desktop sites by default and reports a Macintosh UA,
        which lands on DESKTOP here. A device-toolbar preset that sends an
        &quot;(iPad;&quot; UA lands on MOBILE. Compare this readout against a real
        iPad before concluding anything.
      </p>
    </div>
  );
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
      <LayoutDetection />
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
      url: "https://hush.daily.co/demo",
      // The two workarounds suggested for T-3598, applied here so the demo
      // shows whether they survive the mobile-UI branch.
      activeSpeakerMode: false,
      layoutConfig: { grid: { maxTilesPerPage: 8 } },
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
