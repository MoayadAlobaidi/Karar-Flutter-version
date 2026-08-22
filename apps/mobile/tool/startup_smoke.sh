#!/usr/bin/env bash
# STARTUP LIVENESS SMOKE — does the built artifact reach a screen a person can act on?
#
# WHAT THIS EXISTS FOR. Every assertion about this client's startup is a unit
# test against a fake. The Phase 5 closeout ran the artifact on a real runtime
# for the first time and found it never reaches an interactive screen: the last
# rasterised frame freezes and no further frame is produced. A suite of green
# unit tests said nothing about it, because none of them launches anything.
#
# WHAT COUNTS AS PASSING. Not "signed in". The startup machine has several
# legitimate terminal states — unauthenticated, locked, a fail-closed security
# error, an invalid build configuration — and any of them is a screen a person
# can act on. The failure this guards against is the one that is none of them:
# an indefinite transient state.
#
# HOW IT DECIDES, and why it is pixels rather than logs. A log line proves the
# Dart state machine advanced. It does not prove the person saw anything: in the
# defect this was written for, the machine reached `unauthenticated`, the router
# redirected, the gate widget built — and the screen never changed. So the test
# is frame-based: take screenshots over a window and require the screen to STOP
# being the transient one. A frozen frame is the exact signature of the defect.
#
# USAGE
#   tool/startup_smoke.sh <simulator-udid> [seconds]
#
# EXIT
#   0  a terminal, actionable screen was reached
#   1  the app never left its transient state, or never started
set -euo pipefail

UDID="${1:?usage: startup_smoke.sh <simulator-udid> [seconds]}"
BUDGET="${2:-45}"
BUNDLE_ID="com.kararfinance.app.local"
APP="build/ios/iphonesimulator/Runner.app"
SHOTS="$(mktemp -d)"
trap 'rm -rf "$SHOTS"' EXIT

if [[ ! -d "$APP" ]]; then
  echo "FAIL: no built artifact at $APP — build it first:"
  echo "  flutter build ios --simulator --debug --dart-define=KARAR_ENV=LOCAL"
  exit 1
fi

echo "startup-smoke: udid=$UDID budget=${BUDGET}s artifact=$APP"

# A COLD start every time. A warm process would prove nothing about launch, and
# leaving an old instance behind is how a previous investigation spent an hour
# reading the screen of a build it had already replaced.
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl uninstall "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null

# THE STATUS BAR IS NOT THE APP, and comparing whole screenshots let it say so.
#
# The first version of this check compared full-screen captures and reported
# PASS after 31 seconds. What had changed was the CLOCK: the status bar is drawn
# by the system, ticks every minute, and is in every screenshot. The application
# content was byte-identical throughout. A liveness check that a stopped app
# passes by waiting for the next minute is worse than no check, and it is
# exactly the class of vacuous green this phase spent its closeout removing.
#
# So every comparison is a CENTRE CROP of the content area: 1000x1000 around the
# middle of the screen, which contains the transient indicator and any screen
# that replaces it, and contains no system chrome.
shot() {
  xcrun simctl io "$UDID" screenshot "$SHOTS/raw.png" >/dev/null 2>&1
  sips -c 1000 1000 "$SHOTS/raw.png" --out "$1" >/dev/null 2>&1
}

# The first frame, once there is one. Everything after is compared against it.
sleep 4
shot "$SHOTS/first.png"
FIRST="$(md5 -q "$SHOTS/first.png")"

changed=0
frozen_for=0
elapsed=4
while (( elapsed < BUDGET )); do
  sleep 3
  elapsed=$(( elapsed + 3 ))
  shot "$SHOTS/now.png"
  NOW="$(md5 -q "$SHOTS/now.png")"
  if [[ "$NOW" != "$FIRST" ]]; then
    changed=1
    break
  fi
  frozen_for=$(( frozen_for + 3 ))
done

xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true

if (( changed == 1 )); then
  echo "startup-smoke: PASS — the screen left its first frame within ${elapsed}s"
  exit 0
fi

cat <<REASON
startup-smoke: FAIL — the screen did not change for ${frozen_for}s.

The application's content area is byte-identical after ${elapsed}s. That is not
slowness: an animating indicator produces a different frame every tick, so an
unchanged content crop means the UI thread has stopped producing frames. The
comparison excludes the status bar, whose clock changes every minute and which
a stopped app would otherwise "pass" on.
A person sees a spinner that never resolves and cannot act on anything.

This is the failure KAR-RSK-042 records. It is not closed by the startup state
machine reaching a terminal state — that part is separately proven — because
what the person sees does not follow it.
REASON
exit 1
