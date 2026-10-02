import { ROOM_NAME, dailyApi, json } from "./_daily.js";

// POST /api/eject  { userId }  with  Authorization: Bearer <meeting token>
//
// Removes and bans one participant. The caller proves they are a
// moderator by sending their own meeting token. We validate that token
// with Daily and only proceed if it is an owner token for this room.
// That check is what keeps a guest from banning the moderator, even if
// they call this route directly.
export async function POST(request: Request): Promise<Response> {
  const meetingToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!meetingToken) {
    return json(401, { error: "Missing meeting token" });
  }

  const validation = await dailyApi(
    `/meeting-tokens/${encodeURIComponent(meetingToken)}`
  );
  const claims = (await validation.json().catch(() => ({}))) as {
    room_name?: string;
    is_owner?: boolean;
  };
  if (!validation.ok || !claims.is_owner || claims.room_name !== ROOM_NAME) {
    return json(403, { error: "Only a room owner can ban participants" });
  }

  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId) {
    return json(400, { error: "userId is required" });
  }

  // Ban works by user_ids only. Passing session ids ejects without
  // banning, which is not what this demo shows.
  const response = await dailyApi(`/rooms/${ROOM_NAME}/eject`, {
    method: "POST",
    body: JSON.stringify({ user_ids: [body.userId], ban: true }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("eject failed", response.status, result);
    return json(502, { error: "Eject failed", status: response.status });
  }
  return json(200, { ok: true, result });
}
