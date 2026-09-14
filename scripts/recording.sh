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
  if [ -n "$NEG" ]; then
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

*) sed -n '2,12p' "$0"; exit 1 ;;
esac
