/**
 * T-2904 repro: does a background/overlay image render on an HLS livestream
 * started through the Daily REST API?
 *
 * A customer (Capture Technologies) could not get their background image to
 * show on a livestream started via REST. They saw a green background instead.
 * An earlier demo used the client startRecording() path and could NOT
 * reproduce the bug. This script tests the LIVESTREAMING path, which is what
 * the customer actually used.
 *
 * IMPORTANT: Daily will not start a livestream (or a cloud recording) in an
 * empty room. REST `live-streaming/start` returns 404 "room does not seem to
 * be hosting a call currently" unless at least one participant is present. So
 * this repro is a TWO-STEP flow:
 *
 *   Step 1 (create): run with no VCS_REPRO_ROOM set. The script creates a
 *   public throwaway room wired to stream HLS into the custom-hush S3 bucket,
 *   then prints the join URL. Open it in a browser and join with your camera
 *   and mic OFF (presence is all we need to keep the call alive).
 *
 *   Step 2 (run): with the browser participant still in the room, re-run with
 *   VCS_REPRO_ROOM=<room-name>. The script starts a livestream for each of
 *   the three cases, waits so HLS segments get written, then stops it. HLS
 *   output lands at s3://custom-hush/t-2904/<mtgSessionId>/master.m3u8, which
 *   you can pull with the AWS CLI and inspect frame-by-frame.
 *
 * Run with: npm run vcs-repro   (see the two steps above)
 * Needs DAILY_API_KEY in the environment (never printed).
 */

const API_KEY = process.env.DAILY_API_KEY;

if (!API_KEY) {
  console.error("DAILY_API_KEY is not set in the environment. Stopping.");
  process.exit(1);
}

const BASE = "https://api.daily.co/v1";

// The hush domain already has a custom S3 bucket wired up. HLS output lands
// here so we can pull frames and check the pixels.
const HLS_STORAGE = {
  bucket_name: "custom-hush",
  bucket_region: "us-west-2",
  assume_role_arn:
    "arn:aws:iam::955740203061:role/DailyRecordingBucket-hush-custom--dailyRoleA062BD77-7RhGb0J8BIKa",
  path: "t-2904",
};

// A single named streaming endpoint the room streams into.
const STREAMING_ENDPOINTS = [
  {
    name: "hls_s3",
    type: "hls",
    hls_config: {
      save_hls_recording: true,
      storage: HLS_STORAGE,
    },
  },
];

// These composition_params are copied from the customer's real livestream,
// including the undocumented image.zPosition and image.fullScreenScaleMode
// keys they used. They are the same for all three cases. Only the per-case
// image.assetName changes.
const COMMON_PARAMS: Record<string, string | number | boolean> = {
  mode: "grid",
  showImageOverlay: true,
  "videoSettings.omitPausedVideo": true,
  "videoSettings.roundedCorners": true,
  "videoSettings.cornerRadius_gu": 1.2,
  "videoSettings.margin.left_gu": 2,
  "videoSettings.grid.itemInterval_gu": 1,
  "videoSettings.grid.useDominantForSharing": true,
  "videoSettings.margin.right_gu": 2,
  "videoSettings.margin.top_gu": 6,
  "videoSettings.margin.bottom_gu": 5,
  "videoSettings.showParticipantLabels": true,
  "image.zPosition": "background",
  "image.fullScreen": true,
  "image.fullScreenScaleMode": "fit",
  "image.opacity": 1,
};

interface ReproCase {
  id: string;
  label: string;
  assetName: string;
  sessionAssets: Record<string, string>;
}

const CASES: ReproCase[] = [
  {
    id: "a",
    label: "Case A (colliding name, = customer Try2/3)",
    assetName: "overlay.png",
    sessionAssets: {
      "images/overlay.png":
        "https://ctshare.blob.core.windows.net/ct-journey/overlay.png",
    },
  },
  {
    id: "b",
    label: "Case B (control, safe name)",
    assetName: "ct-journey-overlay.png",
    sessionAssets: {
      "images/ct-journey-overlay.png":
        "https://ctshare.blob.core.windows.net/ct-journey/overlay.png",
    },
  },
  {
    id: "c",
    label: "Case C (customer's first attempt, unique name)",
    assetName: "9f0a0ae5-eac0-4f35-a282-04e7aa8b4a14background2.png",
    sessionAssets: {
      "images/9f0a0ae5-eac0-4f35-a282-04e7aa8b4a14background2.png":
        "https://ctshare.blob.core.windows.net/ct-journey/9f0a0ae5-eac0-4f35-a282-04e7aa8b4a14background2.png",
    },
  },
];

// Seconds to let the stream run before we stop it. HLS latency is 12 to 20s,
// so we run long enough that real segments get written to S3.
const RUN_SECONDS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Small typed wrapper over fetch for the Daily REST API. Throws with the
 * response body when the call fails so we see the real error.
 */
async function api<T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  return JSON.parse(text) as T;
}

interface RoomResponse {
  name: string;
  url: string;
}

interface MeetingsResponse {
  data: { id: string; room: string; start_time: number }[];
}

/**
 * Step 1: create a public throwaway room wired to stream HLS into S3, then
 * print the join URL and the command to run step 2.
 */
async function createRoomAndInstruct(): Promise<void> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const name = `t2904-live-${suffix}`;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const room = await api<RoomResponse>("/rooms", "POST", {
    name,
    privacy: "public",
    properties: {
      exp: nowSeconds + 60 * 60,
      start_video_off: true,
      start_audio_off: true,
      streaming_endpoints: STREAMING_ENDPOINTS,
    },
  });
  console.log("Created room:", room.name);
  console.log("Join URL:", room.url);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Open the join URL in a browser.");
  console.log("  2. Join the call with your camera AND mic OFF.");
  console.log("  3. With the tab still open, run:");
  console.log(`       VCS_REPRO_ROOM=${room.name} npm run vcs-repro`);
  console.log("");
  console.log("When you are done, delete the room:");
  console.log(
    `  curl -X DELETE ${BASE}/rooms/${room.name} -H "Authorization: Bearer $DAILY_API_KEY"`
  );
}

/**
 * With a livestream running, Daily records a meeting session. We look it up so
 * we know the mtgSessionId, which is the S3 path segment for the HLS output.
 */
async function findMtgSessionId(room: string): Promise<string | null> {
  try {
    const meetings = await api<MeetingsResponse>(
      `/meetings?room=${encodeURIComponent(room)}&limit=1`,
      "GET"
    );
    if (meetings.data.length > 0) {
      return meetings.data[0].id;
    }
  } catch (err) {
    console.log(`  could not read meetings for ${room}: ${String(err)}`);
  }
  return null;
}

/** Step 2, one case: start the livestream, wait, stop. */
async function runCase(room: string, reproCase: ReproCase): Promise<void> {
  console.log(`\n===== ${reproCase.label} =====`);
  console.log(`  assetName: ${reproCase.assetName}`);

  const instanceId = crypto.randomUUID();
  console.log(`  instanceId: ${instanceId}`);

  const layout = {
    preset: "custom",
    composition_id: "daily:baseline",
    composition_params: {
      ...COMMON_PARAMS,
      "image.assetName": reproCase.assetName,
    },
    session_assets: reproCase.sessionAssets,
  };

  const startedAt = new Date().toISOString();
  await api(`/rooms/${room}/live-streaming/start`, "POST", {
    width: 1920,
    height: 1080,
    fps: 30,
    instanceId,
    endpoints: [{ endpoint: "hls_s3" }],
    layout,
  });
  console.log(`  live-streaming started at ${startedAt} (200 OK)`);

  // Give the session a moment to register before we look it up.
  await sleep(6000);
  const mtgSessionId = await findMtgSessionId(room);
  console.log(`  mtgSessionId: ${mtgSessionId ?? "unknown"}`);
  if (mtgSessionId) {
    console.log(
      `  expected S3 path: s3://custom-hush/t-2904/${mtgSessionId}/master.m3u8`
    );
  }

  // Let the stream run so HLS segments get written to S3.
  await sleep(RUN_SECONDS * 1000);

  await api(`/rooms/${room}/live-streaming/stop`, "POST", { instanceId });
  console.log(`  live-streaming stopped at ${new Date().toISOString()}`);

  // Give S3 a moment to finalize the upload before the next case starts.
  await sleep(4000);
}

async function main(): Promise<void> {
  const room = process.env.VCS_REPRO_ROOM;
  if (!room) {
    console.log("T-2904 HLS livestream repro: step 1 (create room).\n");
    await createRoomAndInstruct();
    return;
  }

  // Each livestream in the same meeting session streams to the same S3 path,
  // so a later case overwrites an earlier one. To capture clean per-case
  // pixels, run one case per fresh session: set VCS_REPRO_CASE to a|b|c and
  // have the participant rejoin (new session) between cases.
  const onlyCase = process.env.VCS_REPRO_CASE?.toLowerCase();
  const cases = onlyCase
    ? CASES.filter((c) => c.id === onlyCase)
    : CASES;

  console.log("T-2904 HLS livestream repro: step 2.");
  console.log(`Room: ${room} (a participant must be joined right now)`);
  console.log(`Cases: ${cases.map((c) => c.id).join(", ")}\n`);
  for (const reproCase of cases) {
    try {
      await runCase(room, reproCase);
    } catch (err) {
      console.error(`  ${reproCase.label} errored: ${String(err)}`);
    }
  }
  console.log(
    "\nDone. Check s3://custom-hush/t-2904/ for the per-session HLS output."
  );
}

void main();
