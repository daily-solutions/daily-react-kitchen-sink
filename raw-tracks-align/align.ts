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
 * WAV-ONLY: this expects gapless WAV input (enable_raw_tracks_transcoded_audio). It does
 * not handle default raw-tracks .webm; see durationMs() for why. Use a room created by
 * scripts/create-raw-tracks-room.ts.
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
  speaker: string; // user_id when set, else participant_id (see below)
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
    user_id?: string;
  };
};

function parseEvents(dir: string): TrackRef[] {
  const jsonFiles = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json"));
  if (jsonFiles.length === 0) {
    throw new Error(`No .json event file found in ${dir}`);
  }
  // One recording per directory. Two event JSONs means two recordings got mixed together,
  // and silently picking one would align the wrong session. Stop and say so.
  if (jsonFiles.length > 1) {
    throw new Error(
      `Found ${jsonFiles.length} .json files in ${dir} (${jsonFiles.join(", ")}). ` +
        `Keep one recording per directory: fetch each with its own --out dir.`
    );
  }
  const jsonName = jsonFiles[0];
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
      // Group by the app-set user_id when present. A reconnect (leave + rejoin) reuses the
      // same user_id but gets a NEW participant_id, so user_id is what merges a speaker's
      // two files back together. Fall back to participant_id when no user_id was set.
      return {
        speaker: e.data?.user_id || e.participant_id,
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

// Per-file duration is the ONE value we cannot get from the event JSON: it has no media
// end time, and the recording-media-finished / track-removed event timestamps overshoot
// the real media length by 1-5s (upload + teardown lag). We read it from the media's own
// duration header.
//
// This is WAV-only on purpose. Gapless WAV (enable_raw_tracks_transcoded_audio) always
// carries a duration header and starts cleanly at timestamp zero, which is what keeps the
// align step exact and "no decode, no re-encode" fast. Default raw-tracks .webm has no
// duration header (ffprobe returns "N/A") and a skewed start timestamp, so we stop with a
// clear message instead of guessing. Record in a room from create-raw-tracks-room.ts.
function durationMs(file: string): number {
  const probed = Number(
    execFileSync(
      FFPROBE,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { encoding: "utf8" }
    ).trim()
  );
  if (!Number.isFinite(probed)) {
    throw new Error(
      `Could not read a duration from ${basename(file)}. This tool only handles gapless WAV ` +
        `(enable_raw_tracks_transcoded_audio); a .webm raw-tracks file has no duration header. ` +
        `Record in a room created by scripts/create-raw-tracks-room.ts, which sets that property.`
    );
  }
  return Math.round(probed * 1000);
}

function safeName(participant: string): string {
  return participant.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function alignParticipant(
  files: { file: string; offsetMs: number; durMs: number }[],
  targetMs: number,
  outFile: string
): void {
  const inputs: string[] = [];
  const chains: string[] = [];
  files.forEach((f, i) => {
    inputs.push("-i", f.file);
    // A WebRTC track ends (and sometimes starts) abruptly, so the join with the surrounding
    // silence is a hard step: an audible click and a full-scale spike in the waveform. A
    // short fade in/out at each fragment's edges ramps it to zero instead. 10 ms is below
    // what you can hear on speech.
    const fadeSec = Math.min(0.01, f.durMs / 1000 / 4);
    const fadeOutStart = (f.durMs / 1000 - fadeSec).toFixed(4);
    chains.push(
      `[${i}]afade=t=in:d=${fadeSec},afade=t=out:st=${fadeOutStart}:d=${fadeSec},adelay=${f.offsetMs}:all=1[a${i}]`
    );
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
      console.log(`  ${r.speaker}  +${offset}s  ${r.fileBase}`);
    }
    console.log("Dry run: offsets only, no media read and no output written.");
    return;
  }

  const withFiles = refs.map((r) => {
    const file = resolveFile(inputDir, r.fileBase);
    return { speaker: r.speaker, file, offsetMs: r.startTsMs - minStart, durMs: durationMs(file) };
  });

  const targetMs = Math.max(...withFiles.map((t) => t.offsetMs + t.durMs));

  // Group each speaker's files (a reconnect gives one speaker more than one file).
  const bySpeaker = new Map<string, { file: string; offsetMs: number; durMs: number }[]>();
  for (const t of withFiles) {
    const list = bySpeaker.get(t.speaker) ?? [];
    list.push({ file: t.file, offsetMs: t.offsetMs, durMs: t.durMs });
    bySpeaker.set(t.speaker, list);
  }

  const outDir = join(inputDir, "aligned");
  mkdirSync(outDir, { recursive: true });

  console.log(`Target length: ${(targetMs / 1000).toFixed(3)}s across ${bySpeaker.size} speaker(s)`);
  for (const [speaker, files] of bySpeaker) {
    const outFile = join(outDir, `${safeName(speaker)}.wav`);
    const offsets = files.map((f) => `${(f.offsetMs / 1000).toFixed(2)}s`).join(", ");
    console.log(`  ${speaker}: ${files.length} file(s), offsets [${offsets}] -> ${outFile}`);
    alignParticipant(files, targetMs, outFile);
  }
  console.log("Done. Each output is the same length and front-aligned to the session start.");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
