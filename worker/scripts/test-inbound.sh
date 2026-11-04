#!/usr/bin/env bash
# Posts a signed fake Slack event and a signed fake Twilio MMS at a running `wrangler dev`
# (npm run dev) and shows both photos landing as `pending` for Ada (seed fellow #1).
#
# Secrets: the worker reads SLACK_SIGNING_SECRET / TWILIO_AUTH_TOKEN from worker/.dev.vars
# (copy .dev.vars.example). This script reads the same file, or the env vars if set.
# In production set them with: npx wrangler secret put SLACK_SIGNING_SECRET  (etc.)
#
# Usage:  npm run test:inbound          (BASE=http://localhost:8787 by default)
#         BASE=http://localhost:8788 bash scripts/test-inbound.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${BASE:-http://localhost:8787}"
IMG_PORT="${IMG_PORT:-8899}"
ADA="f0000000-0000-4000-8000-000000000001"

readvar() { # readvar NAME -> value from env or .dev.vars
  local v="${!1:-}"
  if [ -z "$v" ] && [ -f .dev.vars ]; then v=$(grep -E "^$1=" .dev.vars | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"); fi
  printf '%s' "$v"
}
SLACK_SIGNING_SECRET=$(readvar SLACK_SIGNING_SECRET)
TWILIO_AUTH_TOKEN=$(readvar TWILIO_AUTH_TOKEN)
[ -n "$SLACK_SIGNING_SECRET" ] || { echo "SLACK_SIGNING_SECRET missing (set it in .dev.vars)"; exit 1; }
[ -n "$TWILIO_AUTH_TOKEN" ]   || { echo "TWILIO_AUTH_TOKEN missing (set it in .dev.vars)"; exit 1; }

# A tiny local HTTP server stands in for Slack's url_private_download and Twilio's MediaUrl0.
TMP=$(mktemp -d)
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' | base64 -d > "$TMP/test.png"
python3 -m http.server "$IMG_PORT" --bind 127.0.0.1 --directory "$TMP" >/dev/null 2>&1 &
IMG_PID=$!; disown $IMG_PID 2>/dev/null || true
trap 'kill $IMG_PID 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 0.5
IMG_URL="http://127.0.0.1:$IMG_PORT/test.png"

echo "== 1. Slack url_verification"
TS=$(date +%s)
BODY='{"type":"url_verification","challenge":"abc123xyz"}'
SIG="v0=$(printf '%s' "v0:$TS:$BODY" | openssl dgst -sha256 -hmac "$SLACK_SIGNING_SECRET" | sed 's/^.* //')"
curl -s -X POST "$BASE/hooks/slack" -H 'content-type: application/json' \
  -H "X-Slack-Request-Timestamp: $TS" -H "X-Slack-Signature: $SIG" --data "$BODY"; echo

echo "== 2. Slack message with an image from U0TESTADA (pre-linked to Ada in seed.sql), caption routes with #trivia"
TS=$(date +%s)
BODY=$(cat <<JSON
{"type":"event_callback","team_id":"T0TEST","event":{"type":"message","subtype":"file_share","user":"U0TESTADA","channel":"C0COHORT","channel_type":"channel","ts":"$TS.000100","text":"team photo #trivia","files":[{"id":"F0TEST1","name":"team.png","title":"team.png","mimetype":"image/png","original_w":1,"original_h":1,"url_private_download":"$IMG_URL"}]}}
JSON
)
SIG="v0=$(printf '%s' "v0:$TS:$BODY" | openssl dgst -sha256 -hmac "$SLACK_SIGNING_SECRET" | sed 's/^.* //')"
curl -s -X POST "$BASE/hooks/slack" -H 'content-type: application/json' \
  -H "X-Slack-Request-Timestamp: $TS" -H "X-Slack-Signature: $SIG" --data "$BODY"; echo

echo "== 3. Slack with a WRONG signature (expect 401 bad_signature)"
curl -s -o /dev/stderr -w 'HTTP %{http_code}\n' -X POST "$BASE/hooks/slack" -H 'content-type: application/json' \
  -H "X-Slack-Request-Timestamp: $TS" -H "X-Slack-Signature: v0=deadbeef" --data "$BODY"; echo

echo "== 4. Twilio MMS from Ada's seeded phone (+14155550101), caption '#cohort hike pics'"
URL="$BASE/hooks/twilio"
# key=value pairs; Twilio's signature = base64(HMAC-SHA1(token, URL + sorted(key+value)))
declare -a P=( "AccountSid=ACtest" "Body=#cohort hike pics" "From=+14155550101" "MediaContentType0=image/png" "MediaUrl0=$IMG_URL" "MessageSid=SMtest0001" "NumMedia=1" "To=+14155550199" )
DATA="$URL"
for kv in $(printf '%s\n' "${P[@]}" | cut -d= -f1 | sort); do
  for e in "${P[@]}"; do [ "${e%%=*}" = "$kv" ] && DATA+="${e%%=*}${e#*=}"; done
done
SIG=$(printf '%s' "$DATA" | openssl dgst -sha1 -hmac "$TWILIO_AUTH_TOKEN" -binary | base64)
ARGS=(); for e in "${P[@]}"; do ARGS+=(--data-urlencode "$e"); done
curl -s -X POST "$URL" -H "X-Twilio-Signature: $SIG" "${ARGS[@]}"; echo

echo "== 5. Twilio with a WRONG signature (expect 401)"
curl -s -o /dev/stderr -w 'HTTP %{http_code}\n' -X POST "$URL" -H "X-Twilio-Signature: bogus" "${ARGS[@]}"; echo

echo "== 6. Twilio from an unknown number (expect TwiML asking for the Pulse email)"
declare -a P2=( "AccountSid=ACtest" "Body=hello" "From=+12125550000" "NumMedia=0" "To=+14155550199" )
DATA="$URL"; for kv in $(printf '%s\n' "${P2[@]}" | cut -d= -f1 | sort); do for e in "${P2[@]}"; do [ "${e%%=*}" = "$kv" ] && DATA+="${e%%=*}${e#*=}"; done; done
SIG=$(printf '%s' "$DATA" | openssl dgst -sha1 -hmac "$TWILIO_AUTH_TOKEN" -binary | base64)
ARGS2=(); for e in "${P2[@]}"; do ARGS2+=(--data-urlencode "$e"); done
curl -s -X POST "$URL" -H "X-Twilio-Signature: $SIG" "${ARGS2[@]}"; echo

echo "== 6b. Twilio text-only PLAN from Ada (expect TwiML 'Posted to Bonding: Trivia · …')"
declare -a P3=( "AccountSid=ACtest" "Body=Trivia at the Page Thursday 7pm" "From=+14155550101" "NumMedia=0" "To=+14155550199" )
DATA="$URL"; for kv in $(printf '%s\n' "${P3[@]}" | cut -d= -f1 | sort); do for e in "${P3[@]}"; do [ "${e%%=*}" = "$kv" ] && DATA+="${e%%=*}${e#*=}"; done; done
SIG=$(printf '%s' "$DATA" | openssl dgst -sha1 -hmac "$TWILIO_AUTH_TOKEN" -binary | base64)
ARGS3=(); for e in "${P3[@]}"; do ARGS3+=(--data-urlencode "$e"); done
curl -s -X POST "$URL" -H "X-Twilio-Signature: $SIG" "${ARGS3[@]}"; echo

echo "== 6c. Slack text-only PLAN from U0TESTADA (expect {ok, event, title})"
TS=$(date +%s)
BODY="{\"type\":\"event_callback\",\"team_id\":\"T0TEST\",\"event\":{\"type\":\"message\",\"user\":\"U0TESTADA\",\"channel\":\"C0COHORT\",\"channel_type\":\"channel\",\"ts\":\"$TS.000200\",\"text\":\"what: board games when: tomorrow 6-10pm where: Ada's place\"}}"
SIG="v0=$(printf '%s' "v0:$TS:$BODY" | openssl dgst -sha256 -hmac "$SLACK_SIGNING_SECRET" | sed 's/^.* //')"
curl -s -X POST "$BASE/hooks/slack" -H 'content-type: application/json' -H "X-Slack-Request-Timestamp: $TS" -H "X-Slack-Signature: $SIG" --data "$BODY"; echo

echo "== 7. Ada's pending inbound photos via POST /api/bbload"
curl -s -X POST "$BASE/api/bbload" -H "X-Dev-Fellow: $ADA" -H 'content-type: application/json' -d '{}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const p=(j.photos||[]).filter(p=>p.status==="pending");console.log(JSON.stringify(p.map(({id,source,event_id,caption,filename,bytes,hasThumb})=>({id,source,event_id,caption,filename,bytes,hasThumb})),null,1));})'
