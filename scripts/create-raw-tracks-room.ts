/**
 * Create a Daily room set up for the raw-tracks audio line-up demo.
 *
 * It sets three room properties that make per-speaker alignment easy later:
 *   - enable_recording: "raw-tracks"            -> one file per participant track
 *   - enable_raw_tracks_transcoded_audio        -> gapless, lossless WAV (no internal holes)
 *   - enable_raw_tracks_event_json: true         -> per-file start offsets in an event JSON
 *
 * Run it with Node 24 (reads .env.local and runs the .ts file directly):
 *   node --env-file=.env.local scripts/create-raw-tracks-room.ts
 *   node --env-file=.env.local scripts/create-raw-tracks-room.ts my-room-name
 *   node --env-file=.env.local scripts/create-raw-tracks-room.ts my-room-name --stereo
 *
 * Needs VITE_DAILY_API_KEY in .env.local (already used by this repo).
 *
 * Docs:
 *   https://docs.daily.co/docs/guides/features/recording/index#gapless-transcoded-audio
 *   https://docs.daily.co/changelog/077-2026-04-29#media-services  (enable_raw_tracks_event_json)
 */

// "highest quality" note: every WAV option is 16-bit PCM lossless and 48 kHz is the top
// sample rate Daily offers, so there is nothing higher to pick. A single mic is mono, so
// mono captures the same audio at half the size. Pass --stereo only if you need a stereo
// container downstream.
type TranscodedAudio = "wav-48k-mono" | "wav-48k-stereo";

type RoomProperties = {
  enable_recording: "raw-tracks";
  enable_raw_tracks_transcoded_audio: TranscodedAudio;
  enable_raw_tracks_event_json: boolean;
};

const API_URL = "https://api.daily.co/v1/rooms";

function parseArgs(argv: string[]): { name?: string; stereo: boolean } {
  const args = argv.slice(2);
  const stereo = args.includes("--stereo");
  const name = args.find((a) => !a.startsWith("--"));
  return { name, stereo };
}

async function main(): Promise<void> {
  const apiKey = process.env.VITE_DAILY_API_KEY;
  if (!apiKey) {
    console.error(
      "Missing VITE_DAILY_API_KEY. Run with: node --env-file=.env.local scripts/create-raw-tracks-room.ts"
    );
    process.exit(1);
  }

  const { name, stereo } = parseArgs(process.argv);

  const properties: RoomProperties = {
    enable_recording: "raw-tracks",
    enable_raw_tracks_transcoded_audio: stereo ? "wav-48k-stereo" : "wav-48k-mono",
    enable_raw_tracks_event_json: true,
  };

  const body: { name?: string; properties: RoomProperties } = { properties };
  if (name) body.name = name;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Room creation failed (${res.status}):`, text);
    process.exit(1);
  }

  const room = JSON.parse(text) as {
    name: string;
    url: string;
    config: Partial<RoomProperties>;
  };

  console.log("Created room:", room.url);
  console.log("Properties set on the room:");
  console.log("  enable_recording:", room.config.enable_recording);
  console.log(
    "  enable_raw_tracks_transcoded_audio:",
    room.config.enable_raw_tracks_transcoded_audio
  );
  console.log(
    "  enable_raw_tracks_event_json:",
    room.config.enable_raw_tracks_event_json
  );
  console.log("\nPaste this room URL into the app, then start a raw-tracks recording.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
