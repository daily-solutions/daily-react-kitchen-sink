import { ROOM_NAME, dailyApi, json } from "./_daily.js";

// POST /api/token  { role: "moderator" | "guest" }  ->  { token }
//
// Mints a meeting token server-side so the Daily API key stays off the
// client. The moderator gets is_owner, which Prebuilt needs to open the
// owners-only sidebar integration. Both roles get a user_id, because the
// eject endpoint bans by user_id. The guest id is random so a banned
// guest can reload and try again with a fresh identity.
//
// DEMO ONLY: anyone can ask for the moderator role here. A real app must
// check its own login session before handing out an owner token, since
// everything downstream (the panel, /api/eject) trusts is_owner.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { role?: string };
  const isModerator = body.role === "moderator";

  const response = await dailyApi("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: ROOM_NAME,
        is_owner: isModerator,
        user_name: isModerator ? "Moderator" : "Guest",
        user_id: isModerator
          ? "moderator"
          : `guest-${crypto.randomUUID().slice(0, 8)}`,
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      },
    }),
  });

  const result = (await response.json()) as { token?: string; info?: string };
  if (!response.ok || !result.token) {
    console.error("meeting-tokens failed", response.status, result);
    return json(502, { error: "Could not create meeting token" });
  }
  return json(200, { token: result.token });
}
