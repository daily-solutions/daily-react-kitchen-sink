/**
 * Line up Daily raw-tracks audio into one equal-length, front-aligned WAV per speaker.
 *
 * Why this is simple and cheap:
 *   - Record gapless WAV (enable_raw_tracks_transcoded_audio: wav-48k-mono), so each file
 *     is already continuous: no internal mute/packet-loss holes to patch.
 *   - The event JSON (enable_raw_tracks_event_json) gives each file's start offset on the
 *     session timeline. That offset is the whole trick.
 *   - For each speaker: adelay each file to its offset, overlay the fragments onto one
 *     timeline, then apad to a shared length. On PCM this is near-instant: no decode,
 *     no re-encode.
 *
 * Usage (Node 24 runs the .ts file directly, no build step):
 *   node raw-tracks-align/align.ts ./sample-data
 *
 * Input dir holds the raw-tracks .wav files plus the event JSON. Output is written to
 * <input-dir>/aligned/<speaker>.wav.
 *
 * Requires ffmpeg + ffprobe on PATH (the same tools the customer already uses). If you
 * want zero system deps, swap in ffmpeg-static / ffprobe-static and point FFMPEG/FFPROBE
 * at them.
 *
 * Docs:
 *   https://docs.daily.co/docs/guides/features/recording/index#gapless-transcoded-audio
 *   https://docs.daily.co/changelog/077-2026-04-29#media-services
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE ?? "ffprobe";

// ---------------------------------------------------------------------------
// parseEvents: the ONLY part tied to the event JSON shape.
//
// Written against the real raw-tracks event JSON (format_id "daily-event-json",
// format_version "2026-04-30"). Shape:
//   {
//     "format_id": "daily-event-json",
//     "events": [
//       { "type": "recording-media-started", "participant_id": "...",
//         "data": { "uri": "s3://.../<file>", "contentType": "audio/webm",
//                   "mediaStartTime": 1782199853.618 } },
//       ... (track-added, track-removed, recording-media-finished too)
//     ]
//   }
// We only need the "recording-media-started" audio events: each gives the participant,
// the file (basename of data.uri), and data.mediaStartTime (epoch SECONDS) as the start
// on the session timeline. Everything below this function is schema-independent.
// ---------------------------------------------------------------------------

/** A media file referenced by the event JSON, before it is matched to a local file. */
type TrackRef = {
  participant: string;
  fileBase: string; // basename of the s3 uri, no directory
  startTsMs: number;
};

type MediaStartedEvent = {
  type: string;
  participant_id?: string;
  data?: {
    uri?: string;
    contentType?: string;
    mediaStartTime?: number;
  };
};

function parseEvents(dir: string): TrackRef[] {
  const jsonName = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".json"));
  if (!jsonName) {
    throw new Error(`No .json event file found in ${dir}`);
  }
  const doc = JSON.parse(readFileSync(join(dir, jsonName), "utf8")) as {
    format_id?: string;
    events?: MediaStartedEvent[];
  };

  if (doc.format_id !== "daily-event-json") {
    console.warn(
      `Warning: ${jsonName} format_id is "${doc.format_id}", expected "daily-event-json". parseEvents() may need updating.`
    );
  }
  const events = doc.events ?? [];

  const refs = events
    .filter(
      (e) =>
        e.type === "recording-media-started" &&
        String(e.data?.contentType ?? "").toLowerCase().startsWith("audio")
    )
    .map((e): TrackRef => {
      const uri = e.data?.uri;
      const mediaStartTime = e.data?.mediaStartTime;
      if (!uri || typeof mediaStartTime !== "number" || !e.participant_id) {
        throw new Error(`Incomplete recording-media-started event: ${JSON.stringify(e)}`);
      }
      return {
        participant: e.participant_id,
        fileBase: basename(uri),
        startTsMs: Math.round(mediaStartTime * 1000), // epoch seconds -> ms
      };
    });

  if (refs.length === 0) {
    throw new Error(
      `No audio "recording-media-started" events found in ${jsonName}. Check parseEvents() against the event JSON.`
    );
  }
  return refs;
}

/**
 * Match an event-JSON file reference to an actual file on disk. The s3 uri basename has
 * no extension; downloaded files may keep that exact name or add one (e.g. .webm/.wav).
 */
function resolveFile(dir: string, fileBase: string): string {
  const candidates = readdirSync(dir).filter(
    (f) => f === fileBase || f.startsWith(`${fileBase}.`)
  );
  if (candidates.length === 0) {
    throw new Error(
      `Event JSON references "${fileBase}" but no matching file is in ${dir}. ` +
        `Download the track files next to the event JSON.`
    );
  }
  return join(dir, candidates[0]);
}

// ---------------------------------------------------------------------------
// Alignment (schema-independent from here down)
// ---------------------------------------------------------------------------

function durationMs(file: string): number {
  const out = execFileSync(
    FFPROBE,
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" }
  ).trim();
  return Math.round(Number(out) * 1000);
}

function safeName(participant: string): string {
  return participant.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function alignParticipant(
  files: { file: string; offsetMs: number }[],
  targetMs: number,
  outFile: string
): void {
  const inputs: string[] = [];
  const chains: string[] = [];
  files.forEach((f, i) => {
    inputs.push("-i", f.file);
    chains.push(`[${i}]adelay=${f.offsetMs}:all=1[a${i}]`);
  });

  const labels = files.map((_, i) => `[a${i}]`).join("");
  const mix =
    files.length > 1
      ? `${labels}amix=inputs=${files.length}:normalize=0,apad[out]`
      : `[a0]apad[out]`;
  const filter = [...chains, mix].join(";");

  const targetSec = (targetMs / 1000).toFixed(3);

  execFileSync(
    FFMPEG,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-t",
      targetSec,
      "-c:a",
      "pcm_s16le",
      "-ar",
      "48000",
      outFile,
    ],
    { stdio: ["ignore", "ignore", "inherit"] }
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const inputDir = args.find((a) => !a.startsWith("--")) ?? "./sample-data";
  if (!existsSync(inputDir)) {
    console.error(`Input dir not found: ${inputDir}`);
    process.exit(1);
  }

  const refs = parseEvents(inputDir);

  // Offsets are relative to the earliest file (recording start, for a 1/1 where one
  // joined first).
  const minStart = Math.min(...refs.map((r) => r.startTsMs));

  // --dry-run validates the event JSON (parser + offsets) without reading any media,
  // so you can sanity-check before downloading the track files.
  if (dryRun) {
    console.log(`Parsed ${refs.length} audio file(s) from the event JSON:`);
    for (const r of refs) {
      const offset = ((r.startTsMs - minStart) / 1000).toFixed(3);
      console.log(`  ${r.participant}  +${offset}s  ${r.fileBase}`);
    }
    console.log("Dry run: offsets only, no media read and no output written.");
    return;
  }

  const withFiles = refs.map((r) => {
    const file = resolveFile(inputDir, r.fileBase);
    return { participant: r.participant, file, offsetMs: r.startTsMs - minStart, durMs: durationMs(file) };
  });

  const targetMs = Math.max(...withFiles.map((t) => t.offsetMs + t.durMs));

  const byParticipant = new Map<string, { file: string; offsetMs: number }[]>();
  for (const t of withFiles) {
    const list = byParticipant.get(t.participant) ?? [];
    list.push({ file: t.file, offsetMs: t.offsetMs });
    byParticipant.set(t.participant, list);
  }

  const outDir = join(inputDir, "aligned");
  mkdirSync(outDir, { recursive: true });

  console.log(`Target length: ${(targetMs / 1000).toFixed(3)}s across ${byParticipant.size} speaker(s)`);
  for (const [participant, files] of byParticipant) {
    const outFile = join(outDir, `${safeName(participant)}.wav`);
    const offsets = files.map((f) => `${(f.offsetMs / 1000).toFixed(2)}s`).join(", ");
    console.log(`  ${participant}: ${files.length} file(s), offsets [${offsets}] -> ${outFile}`);
    alignParticipant(files, targetMs, outFile);
  }
  console.log("Done. Each output is the same length and front-aligned to the session start.");
}

main();
