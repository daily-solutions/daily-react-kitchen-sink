# Line up raw-tracks audio (1/1 call)

Daily raw-tracks gives you one audio file per participant, but the files can start at
different points (a late joiner) and a participant can have more than one file (a
reconnect splits their track). This demo turns those files into **one equal-length,
front-aligned WAV per speaker**, lined up on a shared timeline.

The whole thing is cheap because you let Daily do the hard part during the recording:

1. **Record gapless WAV.** Set `enable_raw_tracks_transcoded_audio: wav-48k-mono` so each
   file is already continuous: no internal mute or packet-loss holes to patch.
2. **Get the offsets.** Set `enable_raw_tracks_event_json: true` so the recording also
   writes an event JSON with each file's start offset on the session timeline. That
   offset is the entire trick.
3. **Align.** For each speaker, `adelay` each file to its offset, overlay the fragments
   onto one timeline, then `apad` to a shared length. On 16-bit PCM this is near-instant:
   no decode, no re-encode.

Docs:
- Gapless transcoded audio: https://docs.daily.co/docs/guides/features/recording/index#gapless-transcoded-audio
- `enable_raw_tracks_event_json` (Apr 29 2026 changelog): https://docs.daily.co/changelog/077-2026-04-29#media-services

## Why not the raw-tracks-tools CLI?

The CLI aligns tracks too, but it outputs a single composited file, not separate
per-speaker tracks. For "two pristine, lined-up audio tracks," the `adelay` step here is
both simpler and version-proof (it does not depend on the CLI knowing about the gapless
WAV feature). See the CLI section for the composite path:
https://docs.daily.co/docs/guides/features/recording/index#using-raw-tracks-tools-cli

## Highest quality

Every WAV option is 16-bit PCM lossless and 48 kHz is the top sample rate Daily offers,
so there is nothing higher to pick. A single mic is mono, so `wav-48k-mono` captures the
same audio at half the size of stereo. Use stereo only if a downstream tool needs a
stereo container.

## Run it

Needs `ffmpeg` and `ffprobe` on your PATH (the same tools you already use). Node 24 runs
the TypeScript directly, no build step.

### 1. Create a room with the right settings

```bash
node --env-file=.env.local scripts/create-raw-tracks-room.ts
# add --stereo for a stereo container, or pass a room name:
# node --env-file=.env.local scripts/create-raw-tracks-room.ts my-room --stereo
```

This needs `VITE_DAILY_API_KEY` in `.env.local` (already used by this repo). Recordings
land in the custom S3 bucket configured on your Daily domain.

(Alternative to the room flag: pass `dataOutputs: ["event-json"]` to `startRecording`
in the app. The room-level flag is the primary path here.)

### 2. Record a 1/1 call

`npm run dev`, open the room in two tabs or two devices, have the second person join a
few seconds late so the offsets differ, then click **Start Raw-Tracks Recording**. Talk
over each other a little, then **Stop Recording** and leave.

### 3. Grab the recording with the REST API

```bash
node --env-file=.env.local scripts/fetch-recording.ts --room raw-tracks --latest
# or a specific recording:
# node --env-file=.env.local scripts/fetch-recording.ts <recording_id>
```

This downloads the event JSON into `raw-tracks-align/sample-data/` and writes a
`pull-media.sh` with the `aws s3 cp` commands for the track files. The recordings API
presigns the event JSON, but raw-tracks media lives in your own S3 bucket, so the media
pull uses your AWS credentials:

```bash
bash raw-tracks-align/sample-data/pull-media.sh
```

### 4. Align

```bash
# validate the event JSON and offsets first, without reading any media:
node raw-tracks-align/align.ts --dry-run ./raw-tracks-align/sample-data

# then produce the aligned tracks:
node raw-tracks-align/align.ts ./raw-tracks-align/sample-data
```

You get one WAV per speaker under `sample-data/aligned/`, all the same length and
front-aligned to the session start.

### 5. Check it

```bash
# durations match
for f in raw-tracks-align/sample-data/aligned/*.wav; do
  echo -n "$f: "; ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f"
done

# a late joiner's file has leading silence equal to its start offset
ffmpeg -hide_banner -i raw-tracks-align/sample-data/aligned/<late-speaker>.wav \
  -af silencedetect=n=-50dB:d=0.1 -f null -
```

## Event JSON format

`parseEvents()` in `align.ts` is the only part tied to the event JSON shape. It is
written against the real `daily-event-json` format (`format_version` `2026-04-30`) and
verified against a live recording. It reads the `recording-media-started` events and
uses, per audio file, `participant_id`, `data.uri` (the file), and `data.mediaStartTime`
(epoch seconds) as the start on the session timeline. Everything else (offsets, ffmpeg)
is schema-independent. If the format version changes, that one function is the only thing
to update.

## Note on audio format

This works on whatever raw-tracks audio you have, but you get the cheap, lossless path
only when the room sets `enable_raw_tracks_transcoded_audio` (gapless WAV). Without it,
the audio files are `audio/webm` (Opus): alignment still works, but ffmpeg has to decode
them and internal gaps are not pre-filled. The room created by
`scripts/create-raw-tracks-room.ts` sets the gapless WAV property for you.
