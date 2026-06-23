/**
 * Grab a raw-tracks recording with the Daily REST API: download the event JSON, and
 * write the aws-cli commands to pull the track files from your S3 bucket.
 *
 * The recordings API presigns the event JSON for you, but raw-tracks media lives in your
 * own custom S3 bucket and is not presigned per-track. So this script downloads the
 * event JSON directly and emits a pull-media.sh you run with your own AWS credentials.
 *
 * Usage (Node 24):
 *   node --env-file=.env.local scripts/fetch-recording.ts <recording_id>
 *   node --env-file=.env.local scripts/fetch-recording.ts --room raw-tracks --latest
 *   node --env-file=.env.local scripts/fetch-recording.ts <recording_id> --out ./raw-tracks-align/sample-data
 *
 * Needs VITE_DAILY_API_KEY in .env.local.
 *
 * Docs:
 *   List recordings:  https://docs.daily.co/reference/rest-api/recordings/list-recordings
 *   Get recording:    https://docs.daily.co/reference/rest-api/recordings/get-recording
 *   Get access link:  https://docs.daily.co/reference/rest-api/recordings/get-recording-link
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const API = "https://api.daily.co/v1";

type Track = { type: string; content_type: string; s3Key: string };
type Recording = {
  id: string;
  room_name?: string;
  status: string;
  duration?: number;
  tracks?: Track[] | null;
  data_outputs?: string[];
};
type AccessLink = {
  s3_bucket?: string;
  s3_region?: string;
  data_outputs?: Record<string, string>;
};

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` };
}

async function getJson<T>(url: string, key: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders(key) });
  const body = await res.text();
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}: ${body}`);
  return JSON.parse(body) as T;
}

function parseArgs(argv: string[]): {
  id?: string;
  room?: string;
  latest: boolean;
  out: string;
} {
  const args = argv.slice(2);
  const valueAfter = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    id: args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true),
    room: valueAfter("--room"),
    latest: args.includes("--latest"),
    out: valueAfter("--out") ?? "./raw-tracks-align/sample-data",
  };
}

async function resolveRecordingId(
  args: { id?: string; room?: string; latest: boolean },
  key: string
): Promise<string> {
  if (args.id) return args.id;
  if (args.room && args.latest) {
    const list = await getJson<{ data: Recording[] }>(
      `${API}/recordings?room_name=${encodeURIComponent(args.room)}&limit=1`,
      key
    );
    const rec = list.data?.[0];
    if (!rec) throw new Error(`No recordings found for room "${args.room}"`);
    return rec.id;
  }
  throw new Error("Provide a <recording_id>, or --room <name> --latest");
}

async function main(): Promise<void> {
  const key = process.env.VITE_DAILY_API_KEY;
  if (!key) {
    console.error("Missing VITE_DAILY_API_KEY. Run with: node --env-file=.env.local scripts/fetch-recording.ts ...");
    process.exit(1);
  }

  const args = parseArgs(process.argv);
  const id = await resolveRecordingId(args, key);

  const rec = await getJson<Recording>(`${API}/recordings/${id}`, key);
  const link = await getJson<AccessLink>(`${API}/recordings/${id}/access-link`, key);

  mkdirSync(args.out, { recursive: true });

  // 1. Event JSON (presigned by the API).
  const eventJsonUrl = link.data_outputs?.["event-json"];
  if (!eventJsonUrl) {
    console.warn(
      "No event-json in this recording's data_outputs. Record with enable_raw_tracks_event_json (or dataOutputs: ['event-json'])."
    );
  } else {
    const text = await (await fetch(eventJsonUrl)).text();
    const eventPath = join(args.out, `${id}.event.json`);
    writeFileSync(eventPath, text);
    console.log(`Saved event JSON -> ${eventPath}`);
  }

  // 2. Track files live in your S3 bucket. Emit aws-cli commands to pull them.
  const tracks = rec.tracks ?? [];
  const audio = tracks.filter((t) => t.content_type?.startsWith("audio"));
  const bucket = link.s3_bucket;
  if (!bucket) {
    console.warn("No s3_bucket in the access-link response; cannot build pull commands.");
  } else {
    const lines = ["#!/usr/bin/env bash", "set -euo pipefail", ""];
    for (const t of tracks) {
      lines.push(`aws s3 cp "s3://${bucket}/${t.s3Key}" "${join(args.out, basename(t.s3Key))}"`);
    }
    const sh = join(args.out, "pull-media.sh");
    writeFileSync(sh, lines.join("\n") + "\n");
    console.log(`Wrote ${tracks.length} track download command(s) -> ${sh}`);
    console.log(`Run it with your AWS credentials for bucket "${bucket}":  bash ${sh}`);
  }

  // Heads-up if this recording is not gapless WAV.
  const nonWav = audio.find((t) => t.content_type !== "audio/wav");
  if (nonWav) {
    console.log(
      `\nNote: audio tracks are "${nonWav.content_type}", not gapless WAV. For the lossless, gap-filled path,\n` +
        `record in a room created by scripts/create-raw-tracks-room.ts (sets enable_raw_tracks_transcoded_audio).`
    );
  }

  console.log(`\nThen align:  node raw-tracks-align/align.ts ${args.out}`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
