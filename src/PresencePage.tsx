import { type ReactElement } from "react";
import { PresencePanel } from "./PresencePanel";

/**
 * Standalone page for the presence + webhooks demo. PresencePanel talks to the
 * backend over fetch and a WebSocket and uses no daily-react hooks, so this page
 * needs no DailyProvider.
 */
export function PresencePage(): ReactElement {
  return (
    <div
      style={{
        maxWidth: 680,
        margin: "24px auto",
        padding: "0 16px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>Daily presence + webhooks</h1>
      <p style={{ color: "#555" }}>
        A live room roster built from the Presence API snapshot (reconciled every
        10s) plus participant.joined / participant.left webhooks pushed over a
        WebSocket. See the README for the backend and ngrok setup. The full
        kitchen-sink demo is at <code>?kitchensink=true</code>.
      </p>
      <PresencePanel />
    </div>
  );
}
