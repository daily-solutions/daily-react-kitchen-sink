import http from "node:http";
import express from "express";
import type { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { verifySignature } from "./verifySignature.ts";

// Load env from .env.local first (real secrets, gitignored), then .env.
dotenv.config({ path: [".env.local", ".env"] });

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_WEBHOOK_HMAC = process.env.DAILY_WEBHOOK_HMAC;
const PORT = Number(process.env.PORT ?? 4000);

if (!DAILY_API_KEY) {
  console.warn("[server] DAILY_API_KEY is not set. /api/presence will fail.");
}
if (!DAILY_WEBHOOK_HMAC) {
  console.warn(
    "[server] DAILY_WEBHOOK_HMAC is not set. Webhook events will be rejected until you register a webhook and set it.",
  );
}

// The message we push to browsers over the WebSocket for each participant event.
interface RosterMessage {
  type: "participant.joined" | "participant.left";
  room: string;
  session_id: string;
  user_name: string;
  joined_at: number;
  duration?: number;
  event_ts?: number;
}

const app = express();
app.use(express.json());

// Presence snapshot. The domain API key stays here on the server; the browser
// only ever calls /api/presence.
app.get("/api/presence", async (_req: Request, res: Response) => {
  if (!DAILY_API_KEY) {
    res.status(500).json({ error: "DAILY_API_KEY not set on the server" });
    return;
  }
  try {
    const r = await fetch("https://api.daily.co/v1/presence", {
      headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
    });
    const data: unknown = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `Presence fetch failed: ${String(err)}` });
  }
});

// Daily webhook receiver.
app.post("/api/daily-webhook", (req: Request, res: Response) => {
  const body: unknown = req.body;

  // Create-time handshake: Daily POSTs {"test":"test"} and expects a fast 200.
  if (
    body !== null &&
    typeof body === "object" &&
    (body as { test?: unknown }).test === "test"
  ) {
    res.sendStatus(200);
    return;
  }

  const timestamp = req.header("X-Webhook-Timestamp");
  const signature = req.header("X-Webhook-Signature");
  if (
    !DAILY_WEBHOOK_HMAC ||
    !timestamp ||
    !signature ||
    !verifySignature(timestamp, body, DAILY_WEBHOOK_HMAC, signature)
  ) {
    res.sendStatus(401);
    return;
  }

  // Respond fast (the circuit breaker trips after 3 slow/failed responses), then
  // fan the event out to connected browsers.
  res.sendStatus(200);

  const event = body as {
    type?: string;
    event_ts?: number;
    payload?: {
      room?: string;
      session_id?: string;
      user_name?: string;
      joined_at?: number;
      duration?: number;
    };
  };

  if (event.type !== "participant.joined" && event.type !== "participant.left") {
    return;
  }
  const p = event.payload ?? {};
  broadcast({
    type: event.type,
    room: p.room ?? "",
    session_id: p.session_id ?? "",
    user_name: p.user_name ?? "",
    joined_at: p.joined_at ?? 0,
    duration: p.duration,
    event_ts: event.event_ts,
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(message: RosterMessage): void {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server]   GET  /api/presence`);
  console.log(`[server]   POST /api/daily-webhook`);
  console.log(`[server]   WS   /ws`);
});
