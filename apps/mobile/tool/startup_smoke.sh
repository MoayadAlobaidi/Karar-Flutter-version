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
# WHY TWO RUNTIMES. One runtime cannot tell an application-logic hang from an
# embedder or plugin hang specific to that platform. Running the same artifact
# and the same decision rule on iOS and Android is what separates them, and it
# is how KAR-RSK-042's second half was localised to one of the two.
#
# USAGE
#   tool/startup_smoke.sh ios     <simulator-udid> [seconds]
#   tool/startup_smoke.sh android [emulator-serial] [seconds]
#
# EXIT
#   0  a terminal, actionable screen was reached
#   1  the app never left its transient state, or never started
set -euo pipefail

RUNTIME="${1:?usage: startup_smoke.sh <ios|android> [device] [seconds]}"
DEVICE="${2:-}"
BUDGET="${3:-45}"
BUNDLE_ID="com.kararfinance.app.local"
SHOTS="$(mktemp -d)"
trap 'rm -rf "$SHOTS"' EXIT

command -v sips >/dev/null 2>&1 || {
  echo "FAIL: this check crops screenshots with sips and is macOS-hosted."
  echo "      On another host, replace crop() with an equivalent centre crop."
  exit 1
}

case "$RUNTIME" in
  ios)
    APP="build/ios/iphonesimulator/Runner.app"
    [[ -d "$APP" ]] || {
      echo "FAIL: no built artifact at $APP — build it first:"
      echo "  flutter build ios --simulator --debug --dart-define=KARAR_ENV=LOCAL"
      exit 1
    }
    DEVICE="${DEVICE:-booted}"
    install_app()   { xcrun simctl install "$DEVICE" "$APP"; }
    uninstall_app() { xcrun simctl uninstall "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1 || true; }
    stop_app()      { xcrun simctl terminate "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1 || true; }
    start_app()     { xcrun simctl launch "$DEVICE" "$BUNDLE_ID" >/dev/null; }
    raw_shot()      { xcrun simctl io "$DEVICE" screenshot "$1" >/dev/null 2>&1; }
    # The simulator runs the app as a HOST process, so the port it announces is
    # already a host port and needs no forwarding. The announcement is read
    # from the simulator's own log rather than from the app's console:
    # `--console-pty` writes to a pseudo-terminal and produced an empty file
    # under redirection, and `--console` would hold the launch open for the
    # life of the app. The platform log is the same channel the Android branch
    # reads, which keeps the two runtimes on one mechanism.
    # The announcement is captured LIVE, from a stream opened before the launch.
    # `--console-pty` writes to a pseudo-terminal and produced an empty file
    # under redirection; `--console` holds the launch open for the life of the
    # app; and `log show` after the fact took fifty seconds to scan the archive
    # on a simulator that had been running a while. A stream started first
    # costs nothing and cannot miss a line that has not been printed yet.
    start_app_logged() {
      xcrun simctl spawn "$DEVICE" log stream --style syslog \
        --predicate 'eventMessage CONTAINS "Dart VM service"' > "$SHOTS/app.log" 2>/dev/null &
      APP_LOG_PID=$!
      sleep 2
      start_app
    }
    stop_app_logged() { [[ -n "${APP_LOG_PID:-}" ]] && kill "$APP_LOG_PID" 2>/dev/null || true; }
    service_uri() {
      grep -m1 -o 'http://127.0.0.1:[0-9]*/[A-Za-z0-9_=-]*=*/' "$SHOTS/app.log" 2>/dev/null || true
    }
    ;;
  android)
    APP="build/app/outputs/flutter-apk/app-debug.apk"
    [[ -f "$APP" ]] || {
      echo "FAIL: no built artifact at $APP — build it first:"
      echo "  flutter build apk --debug --dart-define=KARAR_ENV=LOCAL"
      exit 1
    }
    ADB=(adb)
    [[ -n "$DEVICE" ]] && ADB=(adb -s "$DEVICE")
    install_app()   { "${ADB[@]}" install -r "$APP" >/dev/null; }
    uninstall_app() { "${ADB[@]}" uninstall "$BUNDLE_ID" >/dev/null 2>&1 || true; }
    stop_app()      { "${ADB[@]}" shell am force-stop "$BUNDLE_ID" >/dev/null 2>&1 || true; }
    # Started by explicit component, never by `monkey`: monkey delivers a
    # synthetic gesture that can open the notification shade instead, and a
    # screenshot of the shade is not a screenshot of this application.
    start_app()     { "${ADB[@]}" shell am start -n "$BUNDLE_ID/com.kararfinance.app.MainActivity" >/dev/null; }
    raw_shot()      { "${ADB[@]}" exec-out screencap -p > "$1" 2>/dev/null; }
    # The emulator's service port lives inside the device, so it is read from
    # logcat and then forwarded to the same number on the host.
    start_app_logged() { start_app; }
    stop_app_logged()  { :; }
    service_uri() {
      local line port
      line="$("${ADB[@]}" logcat -d 2>/dev/null | grep -m1 -o 'http://127.0.0.1:[0-9]*/[A-Za-z0-9_=-]*=*/' || true)"
      [[ -z "$line" ]] && return 0
      port="$(printf '%s' "$line" | sed -E 's#http://127.0.0.1:([0-9]+)/.*#\1#')"
      "${ADB[@]}" forward "tcp:$port" "tcp:$port" >/dev/null 2>&1 || true
      printf '%s' "$line"
    }
    ;;
  *)
    echo "FAIL: unknown runtime '$RUNTIME' (expected ios or android)"
    exit 1
    ;;
esac

echo "startup-smoke: runtime=$RUNTIME device=${DEVICE:-<default>} budget=${BUDGET}s artifact=$APP"

# A COLD start every time. A warm process would prove nothing about launch, and
# leaving an old instance behind is how a previous investigation spent an hour
# reading the screen of a build it had already replaced.
stop_app
uninstall_app
install_app
[[ "$RUNTIME" == android ]] && "${ADB[@]}" logcat -c >/dev/null 2>&1
start_app_logged

# THE STATUS BAR IS NOT THE APP, and comparing whole screenshots let it say so.
#
# The first version of this check compared full-screen captures and reported
# PASS after 31 seconds. What had changed was the CLOCK: the status bar is drawn
# by the system, ticks every minute, and is in every screenshot. The application
# content was byte-identical throughout. A liveness check that a stopped app
# passes by waiting for the next minute is worse than no check, and it is
# exactly the class of vacuous green this phase spent its closeout removing.
#
# So every comparison is a CENTRE CROP of the content area, taken as a fraction
# of the device's own screen rather than a fixed pixel box — the two runtimes
# report very different resolutions, and a constant that suited one would crop
# the whole screen or nothing on the other. 60% of width by 50% of height,
# centred, contains the transient indicator and any screen that replaces it, and
# contains neither the status bar above nor the navigation bar below.
shot() {
  raw_shot "$SHOTS/raw.png"
  local w h
  w="$(sips -g pixelWidth "$SHOTS/raw.png" 2>/dev/null | awk '/pixelWidth/{print $2}')"
  h="$(sips -g pixelHeight "$SHOTS/raw.png" 2>/dev/null | awk '/pixelHeight/{print $2}')"
  [[ -n "$w" && -n "$h" ]] || return 1
  sips -c "$(( h / 2 ))" "$(( w * 3 / 5 ))" "$SHOTS/raw.png" --out "$1" >/dev/null 2>&1
}

# TWO QUESTIONS, ASKED SEPARATELY, because one of them cannot be answered by
# watching alone.
#
#   1. DID IT COME TO REST? Sample the whole budget. If the content is still
#      changing between the last two samples, the app has settled on nothing
#      and a person is still looking at a transient state. Pixels answer this.
#
#   2. IS IT STILL DRAWING, AND WHAT IS IT DRAWING? Pixels cannot answer this
#      one, and the two ways of getting that wrong are both in this file's
#      history. The first version exited on the first changed frame, so an app
#      that spun for ever satisfied it. The second called a run of identical
#      frames FROZEN, and failed a healthy artifact that simply started before
#      the first sample. A run of identical frames is genuinely ambiguous: a
#      frozen spinner and a settled sign-in screen look exactly alike.
#
#      A brightness flip was tried as a poke and is NOT used, because it passed
#      on one runtime for a reason that could not be explained — which is the
#      same vacuous green in a new costume.
#
#      So the app is ASKED instead. `tool/startup_probe.dart` dispatches a
#      service extension on the UI isolate: an isolate whose event loop has
#      stopped cannot answer one, and the answer is the widget tree, which says
#      which screen. Liveness and content from one question.
sleep 4
shot "$SHOTS/s0.png"
declare -a HASHES=()
HASHES+=("$(md5 -q "$SHOTS/s0.png")")

elapsed=4
i=0
while (( elapsed < BUDGET )); do
  sleep 3
  elapsed=$(( elapsed + 3 ))
  i=$(( i + 1 ))
  shot "$SHOTS/s$i.png"
  HASHES+=("$(md5 -q "$SHOTS/s$i.png")")
done

samples=${#HASHES[@]}
distinct="$(printf '%s\n' "${HASHES[@]}" | sort -u | wc -l | tr -d ' ')"
settled=0
if (( samples >= 2 )) && [[ "${HASHES[samples-1]}" == "${HASHES[samples-2]}" ]]; then
  settled=1
fi

echo "startup-smoke: ${samples} samples over ${elapsed}s, ${distinct} distinct frames"

fail() {
  stop_app_logged
  stop_app
  echo "$1"
  exit 1
}

if (( settled == 0 )); then
  fail "startup-smoke: FAIL on $RUNTIME — STILL CHANGING after ${elapsed}s. The content
area differed between the last two samples, so the app has not come to rest on
anything. Frames are being produced, which rules out a frozen UI thread — but a
person is still looking at a transient state and still cannot act on it. Raise
the budget if this artifact is legitimately slow to start; do not relax the
settling rule, which is the only thing separating 'started' from 'spinning'."
fi

URI="$(service_uri)"
if [[ -z "$URI" ]]; then
  fail "startup-smoke: FAIL on $RUNTIME — no Dart VM service was announced, so the
question that decides this cannot be asked. Build the DEBUG artifact; a release
build exposes no service extension and this check refuses to guess from pixels
alone."
fi

WS="$(printf '%s' "$URI" | sed -e 's#^http#ws#' -e 's#/$#/ws#')"
if ! TREE="$(dart run tool/startup_probe.dart "$WS" 20 2>"$SHOTS/probe.err")"; then
  fail "startup-smoke: FAIL on $RUNTIME — the UI isolate did not answer.

$(cat "$SHOTS/probe.err")

${samples} identical-or-settled content crops over ${elapsed}s and an isolate
that will not answer a service extension is a UI thread that has stopped
turning. A person sees a screen that never resolves and cannot act on anything.
This is the failure KAR-RSK-042 records."
fi

stop_app_logged
stop_app

# WHAT A TERMINAL SCREEN LOOKS LIKE IN THE TREE. Only ONE state is not
# terminal, so the check names that one rather than trying to enumerate the
# rest: sign-in, the app lock, a fail-closed security error and an invalid
# build configuration are all screens a person can act on, and a check that
# had to list them would go stale the first time another was added.
#
# `StartupGateScreen` itself is NOT the marker — it renders the fail-closed
# states too, and failing on it would fail an app that had correctly stopped
# and said why. The marker is the key on its transient branch.
if printf '%s' "$TREE" | grep -q "startup-transient"; then
  echo "startup-smoke: FAIL on $RUNTIME — the UI isolate answered, so it is alive, but
the widget tree still carries the transient startup branch after ${elapsed}s.
The app is drawing, and what it is drawing is an indicator a person cannot act
on. That is a different defect from a frozen thread and it is not an improvement
on one."
  exit 1
fi

echo "startup-smoke: PASS on $RUNTIME — settled within ${elapsed}s, the UI isolate answered,"
echo "               and the tree it returned holds no transient startup screen."
exit 0
