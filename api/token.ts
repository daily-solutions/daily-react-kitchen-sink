import { ROOM_NAME, dailyApi, json } from "./_daily.js";

// POST /api/token  { role: "moderator" | "guest", userId?: string }
//   ->  { token }
//
// Mints a meeting token server-side so the Daily API key stays off the
// client. The moderator gets is_owner, which Prebuilt needs to open the
// owners-only sidebar integration. Both roles get a user_id, because the
// eject endpoint bans by user_id.
//
// The guest sends a userId it keeps in localStorage, so a reload gets the
// same identity and a ban holds. In a real app this would be the account
// id from your own session, not something the browser picks.
//
// DEMO ONLY: anyone can ask for the moderator role here. A real app must
// check its own login session before handing out an owner token, since
// everything downstream (the panel, /api/eject) trusts is_owner.
const GUEST_ID = /^guest-[a-z0-9-]{1,30}$/;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    role?: string;
    userId?: string;
  };
  const isModerator = body.role === "moderator";
  const guestId =
    body.userId && GUEST_ID.test(body.userId)
      ? body.userId
      : `guest-${crypto.randomUUID().slice(0, 8)}`;

  const response = await dailyApi("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: ROOM_NAME,
        is_owner: isModerator,
        user_name: isModerator ? "Moderator" : "Guest",
        user_id: isModerator ? "moderator" : guestId,
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
