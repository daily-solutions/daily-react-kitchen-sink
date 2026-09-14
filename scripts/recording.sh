#!/usr/bin/env bash
# T-4009: does a custom track from a second, call-object-mode daily-js instance
# land in the Daily cloud recording alongside a Prebuilt embed?
#
# Usage:
#   ./scripts/recording.sh token          mint a whiteboard publisher token
#   ./scripts/recording.sh start          start a cloud recording (NO layout config)
#   ./scripts/recording.sh stop
#   ./scripts/recording.sh fetch <id>     wait for finished, download the .mp4
#   ./scripts/recording.sh check <file>   extract frames, OCR, PASS/FAIL
#   ./scripts/recording.sh preflight <url>       is the URL servable to headless Chrome?
#   ./scripts/recording.sh start-webframe <url>  record with the page as a VCS WebFrame
#   ./scripts/recording.sh update-webframe <url> [w] [h]  swap URL/viewport mid-recording
#   ./scripts/recording.sh check-fps <file>      measure the WebFrame's real update rate
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env.local ] && { set -a; . ./.env.local; set +a; }

KEY="${DAILY_API_KEY:-${VITE_DAILY_API_KEY:-}}"
ROOM="${DAILY_ROOM_NAME:-demo}"
OUT="${OUT_DIR:-./whiteboard-evidence}"
: "${KEY:?set DAILY_API_KEY or VITE_DAILY_API_KEY in .env.local}"

api() { curl -sS -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' "$@"; }

case "${1:-}" in
token)
  # Non-owner on purpose: mirrors what the customer would actually ship.
  api -X POST https://api.daily.co/v1/meeting-tokens \
    -d "{\"properties\":{\"room_name\":\"$ROOM\",\"user_name\":\"whiteboard\",\"is_owner\":false}}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])'
  ;;

start)
  # Empty body ON PURPOSE. No layout, no composition_params, so this run also
  # answers "does the custom track need VCS config to be composited?"
  api -X POST "https://api.daily.co/v1/rooms/$ROOM/recordings/start" -d '{}'
  echo
  ;;

stop)
  api -X POST "https://api.daily.co/v1/rooms/$ROOM/recordings/stop"; echo
  ;;

fetch)
  ID="${2:?usage: recording.sh fetch <recording_id>}"
  mkdir -p "$OUT"
  for _ in $(seq 1 60); do
    STATUS=$(api "https://api.daily.co/v1/recordings/$ID" \
      | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')
    echo "status: $STATUS"
    [ "$STATUS" = "finished" ] && break
    sleep 10
  done
  [ "$STATUS" = "finished" ] || { echo "never finished"; exit 1; }
  LINK=$(api "https://api.daily.co/v1/recordings/$ID/access-link?valid_for_secs=3600" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["download_link"])')
  curl -sS -o "$OUT/$ID.mp4" "$LINK"
  echo "saved $OUT/$ID.mp4"
  ffprobe -v error -show_entries format=duration -show_entries stream=width,height \
    -of default=noprint_wrappers=1 "$OUT/$ID.mp4"
  ;;

check)
  MP4="${2:?usage: recording.sh check <file.mp4>}"
  DIR="$OUT/frames"; rm -rf "$DIR"; mkdir -p "$DIR"
  ffmpeg -v error -i "$MP4" -vf fps=1 "$DIR/%03d.png"
  echo "extracted $(ls "$DIR" | wc -l | tr -d ' ') frames"

  read_counter() {
    tesseract "$1" - --psm 6 2>/dev/null \
      | grep -oE 'Frame:? *[0-9]+' | grep -oE '[0-9]+' | head -1
  }

  EARLY=$(ls "$DIR"/*.png | head -20 | tail -1)
  LATE=$(ls "$DIR"/*.png | tail -5 | head -1)
  A=$(read_counter "$EARLY" || true); B=$(read_counter "$LATE" || true)
  GAP=$(( $(ls "$DIR"/*.png | wc -l) - 24 ))
  echo "early frame $EARLY -> counter '${A:-none}'"
  echo "late  frame $LATE -> counter '${B:-none}'"

  # Negative control: the Prebuilt-published canvas must never appear.
  NEG=$(grep -lI . /dev/null 2>/dev/null; for f in "$DIR"/*.png; do
          tesseract "$f" - --psm 6 2>/dev/null | grep -qi "NEG PREBUILT" && echo "$f"; done)
  if [ -n "${NEG:-}" ]; then
    echo "FAIL: NEG PREBUILT appears in: $NEG"
    echo "      => the Prebuilt startCustomTrack path WORKS and our diagnosis is wrong."
    exit 1
  fi
  echo "negative control OK: no NEG PREBUILT frame found"

  if [ -z "${A:-}" ] || [ -z "${B:-}" ]; then
    echo "FAIL: no frame counter readable, whiteboard tile is absent or unreadable"; exit 1
  fi
  DELTA=$(( B - A ))
  EXPECTED=$(( GAP * 30 ))
  echo "counter delta $DELTA over ~${GAP}s (expected ~$EXPECTED at 30fps)"
  if [ "$DELTA" -lt $(( EXPECTED * 60 / 100 )) ]; then
    echo "FAIL: counter barely advanced, track was frozen"; exit 1
  fi
  echo "PASS: whiteboard tile is in the recording and the counter advances"
  ;;

preflight)
  URL="${2:?usage: recording.sh preflight <url>}"
  # The media worker loads this with headless Chrome, so ask as Chrome would.
  # A free ngrok account serves an HTML interstitial to browser user agents,
  # which would render INSTEAD of the whiteboard and waste a recording.
  BODY=$(curl -sS -L --max-time 20 \
    -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
    "$URL")
  if grep -qi "ngrok" <<<"$BODY"; then
    echo "FAIL: ngrok interstitial is being served to a browser user agent."
    echo "      WebFrame would render the warning page, not the whiteboard."
    exit 1
  fi
  if ! grep -q 'id="root"' <<<"$BODY"; then
    echo "FAIL: response does not look like the app (no #root)."; exit 1
  fi
  # Rules the media worker enforces that the docs never mention:
  # vcs/server-render/asset-download/validate-asset-url.js:7-42
  case "$URL" in
    http://*|https://*) ;;
    *) echo "FAIL: must be http or https"; exit 1 ;;
  esac
  HOST=$(sed -E 's#^https?://##; s#/.*##' <<<"$URL")
  case "$HOST" in
    *:*) echo "FAIL: explicit port not allowed by the URL validator"; exit 1 ;;
  esac
  grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' <<<"$HOST" && { echo "FAIL: IP literal not allowed"; exit 1; }
  grep -q '\.' <<<"$HOST" || { echo "FAIL: host needs a TLD"; exit 1; }
  echo "PASS: $URL is servable to headless Chrome and satisfies the URL validator"
  ;;

start-webframe)
  URL="${2:?usage: recording.sh start-webframe <url>}"
  # dominant + includeWebFrame puts the page in the MAIN slot with cameras as
  # chiclets, which is the shape the customer actually wants. An overlay would
  # only put it in a corner.
  api -X POST "https://api.daily.co/v1/rooms/$ROOM/recordings/start" -d "{
    \"layout\": {
      \"preset\": \"custom\",
      \"composition_id\": \"daily:baseline\",
      \"composition_params\": {
        \"mode\": \"dominant\",
        \"videoSettings.dominant.includeWebFrame\": true,
        \"videoSettings.showParticipantLabels\": true,
        \"showWebFrameOverlay\": false,
        \"webFrame.url\": \"$URL\",
        \"webFrame.viewportWidth_px\": 1280,
        \"webFrame.viewportHeight_px\": 720
      }
    }
  }"; echo
  ;;

update-webframe)
  URL="${2:?usage: recording.sh update-webframe <url> [w] [h]}"
  W="${3:-960}"; H="${4:-540}"
  api -X POST "https://api.daily.co/v1/rooms/$ROOM/recordings/update" -d "{
    \"layout\": {
      \"preset\": \"custom\",
      \"composition_params\": {
        \"mode\": \"dominant\",
        \"videoSettings.dominant.includeWebFrame\": true,
        \"videoSettings.showParticipantLabels\": true,
        \"webFrame.url\": \"$URL\",
        \"webFrame.viewportWidth_px\": $W,
        \"webFrame.viewportHeight_px\": $H
      }
    }
  }"; echo
  ;;

check-fps)
  MP4="${2:?usage: recording.sh check-fps <file.mp4>}"
  FROM="${3:-10}"; DUR="${4:-10}"
  # The existing `check` proves the counter moves, which only measures the CANVAS.
  # WebFrame is capped at 2fps (webframe/index.js:117) and halves itself if slow,
  # so we need distinct counter values per second to see the real capture rate.
  D="$OUT/fps"; rm -rf "$D"; mkdir -p "$D"
  # Crop to the whiteboard and INVERT: tesseract reads light-on-dark badly, and
  # OCR of the whole 1080p frame finds nothing at all.
  ffmpeg -v error -ss "$FROM" -t "$DUR" -i "$MP4" \
    -vf "fps=10,crop=1400:250:40:380,negate,format=gray" "$D/%03d.png"
  for f in "$D"/*.png; do
    tesseract "$f" - --psm 7 2>/dev/null | grep -oE 'Frame: *[0-9]+' | grep -oE '[0-9]+' || true
  done | grep -v '^$' > "$D/counters.txt"
  TOTAL=$(wc -l < "$D/counters.txt" | tr -d ' ')
  UNIQ=$(sort -u "$D/counters.txt" | wc -l | tr -d ' ')
  echo "sampled $TOTAL readable frames over ${DUR}s, $UNIQ distinct counter values"
  if [ "$TOTAL" -eq 0 ]; then echo "FAIL: counter never readable"; exit 1; fi
  RATE=$(python3 -c "print(round($UNIQ/$DUR, 2))")
  echo "effective whiteboard update rate: ~${RATE} fps"
  if [ "$UNIQ" -le 1 ]; then echo "FAIL: counter never changed, frame is frozen"; exit 1; fi
  if python3 -c "import sys; sys.exit(0 if $UNIQ/$DUR >= 1.5 else 1)"; then
    echo "PASS: whiteboard is live in the recording"
  else
    echo "FAIL: under 1.5 distinct values per second"; exit 1
  fi
  ;;

*) sed -n '2,16p' "$0"; exit 1 ;;
esac
