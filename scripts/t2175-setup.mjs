// T-2175 zemplar repro: create (or update) a Daily room with the customer's
// exact auto_transcription_settings, and mint an owner meeting token with
// enable_live_captions_ui + auto_start_transcription.
//
// Usage: node scripts/t2175-setup.mjs
// Prints JSON: { roomUrl, token, appUrl }

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOM_NAME = "t2175-zemplar-repro";

// Customer's exact settings from the support thread (Plain T-2175).
const AUTO_TRANSCRIPTION_SETTINGS = {
  language: "en",
  model: "nova-3-medical",
  profanity_filter: false,
  endpointing: 500,
  includeRawResponse: true,
  extra: {
    interim_results: true,
    mip_opt_out: true,
    numerals: false,
  },
};

function getApiKey() {
  if (process.env.DAILY_API_KEY) return process.env.DAILY_API_KEY;
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const env = readFileSync(join(repoRoot, ".env.local"), "utf8");
  const match = env.match(/^VITE_DAILY_API_KEY="?([^"\n]+)"?$/m);
  if (!match) throw new Error("VITE_DAILY_API_KEY not found in .env.local");
  return match[1];
}

async function dailyApi(apiKey, method, path, body) {
  const res = await fetch(`https://api.daily.co/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

export async function createRoomAndToken() {
  const apiKey = getApiKey();

  const roomProps = {
    enable_screenshare: true,
    auto_transcription_settings: AUTO_TRANSCRIPTION_SETTINGS,
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  };

  let room;
  try {
    room = await dailyApi(apiKey, "POST", "/rooms", {
      name: ROOM_NAME,
      properties: roomProps,
    });
  } catch (err) {
    if (!String(err).includes("already exists")) throw err;
    // Room exists from an earlier run: update its properties instead.
    room = await dailyApi(apiKey, "POST", `/rooms/${ROOM_NAME}`, {
      properties: roomProps,
    });
  }

  // Customer's exact meeting token properties.
  const token = await dailyApi(apiKey, "POST", "/meeting-tokens", {
    properties: {
      room_name: ROOM_NAME,
      is_owner: true,
      enable_live_captions_ui: true,
      auto_start_transcription: true,
      exp: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
    },
  });

  const appUrl = `http://localhost:3000/?zemplar=1&roomUrl=${encodeURIComponent(
    room.url
  )}&t=${encodeURIComponent(token.token)}`;

  return { roomUrl: room.url, token: token.token, appUrl };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createRoomAndToken()
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
