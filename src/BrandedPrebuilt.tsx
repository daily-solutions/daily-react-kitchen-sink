import { useEffect, useRef } from "react";
import { useCallFrame } from "@daily-co/daily-react";

// The Daily domain that actually owns the rooms. Set VITE_DAILY_DOMAIN in
// .env.local to point at your own domain (e.g. "acme" for acme.daily.co).
// Falls back to "hush" when the variable is unset or blank.
const DAILY_DOMAIN =
  ((import.meta.env.VITE_DAILY_DOMAIN as string | undefined) ?? "").trim() ||
  "hush";

/**
 * Serves Daily Prebuilt from your own (sub)domain.
 *
 * Host this app on e.g. https://video.example.com. A visit to
 * https://video.example.com/my-room?t=<meeting-token> joins
 * https://<DAILY_DOMAIN>.daily.co/my-room in a full-page Prebuilt iframe.
 * The address bar keeps showing your domain the whole time.
 */
export const BrandedPrebuilt = ({ roomName }: { roomName: string }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const token = new URLSearchParams(window.location.search).get("t");
  const dailyRoomUrl = `https://${DAILY_DOMAIN}.daily.co/${encodeURIComponent(
    roomName
  )}`;

  const callFrame = useCallFrame({
    // @ts-expect-error will be fixed in the next release
    parentElRef: wrapperRef,
    options: {
      url: dailyRoomUrl,
      ...(token ? { token } : {}),
      showLeaveButton: true,
      iframeStyle: {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        border: "0",
      },
    },
  });

  useEffect(() => {
    if (!callFrame) return;
    // @ts-expect-error debugging
    window.callObject = callFrame;
    console.log("Joining Daily room:", dailyRoomUrl);
    callFrame.join().catch((err) => {
      console.error("Error joining call", err);
    });
  }, [callFrame, dailyRoomUrl]);

  return <div ref={wrapperRef} />;
};
