import { defineConfig, loadEnv, type Plugin, type Connect } from "vite";
import type { ServerResponse } from "node:http";
import react from "@vitejs/plugin-react-swc";

// Backend for the "remove participant" demo (?demo=remove-participant).
// Keeps the Daily API key server-side so it never reaches the browser bundle.
// Only runs under `npm run dev` (Vite dev middleware), not `vite preview`.
const DAILY_API = "https://api.daily.co/v1";
const DEMO_ROOM = "remove-participant-demo";

function dailyRestProxy(): Plugin {
  let apiKey = "";

  // Ejected user_ids. Daily's eject-ban does not reliably block a freshly minted
  // token on rejoin, so we also refuse to issue a token to a banned user. This
  // mirrors a real app flow: the backend cancels the session so the user cannot
  // get back in. In-memory only: cleared when the dev server restarts.
  const bannedUserIds = new Set<string>();

  return {
    name: "daily-rest-proxy",

    config(_, { mode }) {
      // Read .env.local. Prefer the un-prefixed key (never bundled); fall back to
      // the existing VITE_ one so the demo still runs if only that is set.
      const env = loadEnv(mode, process.cwd(), "");
      apiKey = env.DAILY_API_KEY || env.VITE_DAILY_API_KEY || "";
    },

    configureServer(server) {
      // Call the Daily REST API with the server-side key.
      const daily = async (
        path: string,
        body: unknown
      ): Promise<{ status: number; json: any }> => {
        const res = await fetch(`${DAILY_API}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let json: any = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          json = { raw: text };
        }
        return { status: res.status, json };
      };

      const readJson = (req: Connect.IncomingMessage): Promise<any> =>
        new Promise((resolve) => {
          let data = "";
          req.on("data", (chunk) => (data += chunk));
          req.on("end", () => {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch {
              resolve({});
            }
          });
        });

      server.middlewares.use(
        (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          const url = (req.url ?? "").split("?")[0];
          if (req.method !== "POST" || !url.startsWith("/api/")) {
            next();
            return;
          }

          const send = (status: number, payload: unknown) => {
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(payload));
          };

          void (async () => {
            if (!apiKey) {
              send(500, {
                error:
                  "DAILY_API_KEY not set in .env.local (add it un-prefixed so it stays server-side).",
              });
              return;
            }
            try {
              if (url === "/api/session") {
                const { admin, builtinAdmin, userId } = await readJson(req);

                // Refuse to mint a token for someone who was ejected + banned.
                if (userId && bannedUserIds.has(userId as string)) {
                  send(403, { error: "banned" });
                  return;
                }

                // Ensure the demo room exists. If it already exists the create
                // call 400s; in that case fetch it to get the URL.
                let roomUrl: string | undefined;
                const created = await daily("/rooms", {
                  name: DEMO_ROOM,
                  privacy: "private",
                });
                if (created.status === 200) {
                  roomUrl = created.json.url;
                } else {
                  const getRes = await fetch(`${DAILY_API}/rooms/${DEMO_ROOM}`, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                  });
                  const getJson: any = await getRes.json();
                  roomUrl = getJson.url;
                }

                // Default tokens are NON-admin (no is_owner, no canAdmin) — that is
                // the whole point: the built-in remove menu and rejoin notice never
                // show. builtinAdmin=true mints an admin token so you can SEE the
                // built-in menu the customer wants gone (before/after comparison).
                const properties: Record<string, unknown> = {
                  room_name: DEMO_ROOM,
                  user_name: admin ? "Admin" : "Guest",
                };
                // Stable user_id so an eject+ban survives the guest refreshing.
                if (userId) {
                  properties.user_id = userId as string;
                }
                if (builtinAdmin) {
                  properties.permissions = { canAdmin: ["participants"] };
                }
                const token = await daily("/meeting-tokens", { properties });

                send(200, {
                  roomName: DEMO_ROOM,
                  roomUrl,
                  token: token.json.token,
                });
                return;
              }

              if (url === "/api/eject") {
                const { sessionId, userId, ban } = await readJson(req);
                // Remember the ban so the user can't get a fresh token on refresh.
                if (ban && userId) {
                  bannedUserIds.add(userId as string);
                }
                // Eject by session id; ban by user_id (that is what ban keys on).
                const body: Record<string, unknown> = {
                  ids: [sessionId],
                  ban: Boolean(ban),
                };
                if (userId) {
                  body.user_ids = [userId as string];
                }
                const out = await daily(`/rooms/${DEMO_ROOM}/eject`, body);
                send(out.status, out.json);
                return;
              }

              if (url === "/api/mute") {
                // canSend is the list of media the participant may still send.
                // ["video"] = mic muted, ["audio"] = camera off, [] = both blocked,
                // ["audio","video"] = restored. Dropping a kind turns that track
                // off server-side (off.byCanSendPermission).
                const { sessionId, canSend } = await readJson(req);
                const out = await daily(`/rooms/${DEMO_ROOM}/update-permissions`, {
                  data: { [sessionId as string]: { canSend } },
                });
                send(out.status, out.json);
                return;
              }

              next();
            } catch (err) {
              send(500, { error: String(err) });
            }
          })();
        }
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  server: {
    port: 3000,
  },
  plugins: [react(), dailyRestProxy()],
});
