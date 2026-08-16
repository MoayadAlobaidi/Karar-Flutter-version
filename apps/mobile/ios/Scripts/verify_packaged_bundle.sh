#!/bin/sh
#
# THE PACKAGED ARTIFACT IS THE THING UNDER TEST, NOT THE SOURCE PLIST.
#
# Runs as the last build phase of the Runner target: after Xcode has written
# ${TARGET_BUILD_DIR}/${INFOPLIST_PATH}, after the Flutter `Thin Binary` phase
# has made its own additions to that file, and before code signing. Everything
# below reads or rewrites the file that actually ships.
#
# WHY A BUILD PHASE AND NOT A PLIST SETTING. iOS builds one Info.plist for
# every configuration, and an xcconfig cannot see which ENVIRONMENT a build was
# compiled for: Debug and LOCAL are different axes, and `flutter build ios
# --debug --dart-define=KARAR_ENV=DEV` is a Debug build of a deployed
# environment. The environment is only knowable from DART_DEFINES, which is a
# build setting only a script can decode.
#
# WHY THIS CANNOT FAIL OPEN. The exception is not in Runner/Info.plist and is
# not in any configuration by default. It exists in a packaged artifact only if
# this phase runs AND decodes an environment AND that environment is LOCAL AND
# the fragment file is present AND the merge succeeds AND the re-read confirms
# it. Every one of those failing removes the exception rather than keeping it,
# because the artifact starts without it. The reverse mistake — a deployed
# build somehow carrying an ATS key — is checked for explicitly and fails the
# build.
#
# Absence of KARAR_ENV is NOT treated as LOCAL. A build that was not told its
# environment is refused the exception, which costs nothing: the Dart
# configuration loader has no default for KARAR_ENV either, so such a build
# reaches CONFIG_INVALID at startup and never issues a request.
#
# It also asserts that the privacy disclosures are really in the bundle. An
# empty Face ID purpose string, or an Arabic localization that silently failed
# to copy, both look like working builds and are noticed only by the user being
# asked to authenticate in a language they do not read.
#
# `set -eu` makes an unexpected error a build failure rather than a skipped
# check. There is no branch that logs a warning and continues.
set -eu

fail() {
    echo "error: $1" >&2
    exit 1
}

plist="${TARGET_BUILD_DIR:-}/${INFOPLIST_PATH:-}"
if [ ! -f "$plist" ]; then
    fail "no packaged Info.plist at '$plist'. This phase must run after the \
plist is written; it cannot verify what it cannot read."
fi

fragment="${SRCROOT:-}/Runner/ATSLocalDevelopment.plist"

# ---------------------------------------------------------------------------
# The compiled environment
# ---------------------------------------------------------------------------
#
# The Flutter tool passes --dart-define values into the Xcode build as
# DART_DEFINES: a comma-separated list of base64-encoded KEY=VALUE entries.
# This is the same list the Android build guard reads. Entries that are not
# base64, or not this key, are skipped rather than guessed at.
compiled_environment=""
if [ -n "${DART_DEFINES:-}" ]; then
    for entry in $(printf '%s' "$DART_DEFINES" | tr ',' ' '); do
        decoded="$(printf '%s' "$entry" | base64 -D 2>/dev/null || true)"
        case "$decoded" in
            KARAR_ENV=*)
                compiled_environment="$(printf '%s' "${decoded#KARAR_ENV=}" \
                    | tr '[:lower:]' '[:upper:]')"
                ;;
        esac
    done
fi

# The artifact states which environment it was built for. Without this an
# artifact-level test cannot tell a LOCAL build from a STAGING one — both are
# `Runner.app` at the same path — and the assertion that a STAGING artifact
# carries no exception would be vacuous. UNSET is recorded rather than the key
# omitted, so that "this phase did not run" and "this build was not told its
# environment" stay distinguishable to anything reading the artifact.
plutil -replace KararBuildEnvironment -string \
    "${compiled_environment:-UNSET}" "$plist" \
    || fail "could not record the build environment in the packaged plist"

# ---------------------------------------------------------------------------
# The local HTTP exception
# ---------------------------------------------------------------------------
if [ "${CONFIGURATION:-}" = "Debug" ] && [ "$compiled_environment" = "LOCAL" ]; then
    if [ ! -f "$fragment" ]; then
        fail "$fragment is missing. A LOCAL build cannot reach the API on \
http://localhost:3000 without it."
    fi

    # A merge, not a copy of an arbitrary file: the fragment is read as a plist
    # and rejected if it is anything other than the narrow exception on record.
    # Widening it is then an edit to a reviewed file rather than a value this
    # phase would carry through unexamined.
    granted="$(plutil -convert xml1 -o - "$fragment")" \
        || fail "$fragment is not a readable plist"
    expected='{"NSAllowsArbitraryLoads":false,"NSExceptionDomains":{"localhost":{"NSExceptionAllowsInsecureHTTPLoads":true,"NSIncludesSubdomains":false}}}'
    if [ "$(printf '%s' "$granted" | plutil -convert json -o - -)" != "$expected" ]; then
        fail "$fragment is not the exception on record. Expected exactly \
$expected"
    fi

    plutil -replace NSAppTransportSecurity -xml "$granted" "$plist" \
        || fail "could not merge the local-development exception into the packaged plist"
    echo "note: merged the localhost App Transport Security exception into a \
Debug / LOCAL build"
else
    # Nothing put an ATS key here, so this normally removes nothing. It runs
    # anyway because "normally" is not a guarantee: a plugin, a future build
    # phase or an incremental build over an older artifact could all leave one
    # behind.
    if plutil -extract NSAppTransportSecurity xml1 -o - "$plist" >/dev/null 2>&1; then
        echo "note: removing an App Transport Security exception from a \
${CONFIGURATION:-unknown} build compiled for \
'${compiled_environment:-no environment}'; it is granted only to a Debug build \
compiled for LOCAL"
        plutil -remove NSAppTransportSecurity "$plist" \
            || fail "could not remove NSAppTransportSecurity from the packaged plist"
    fi

    # Re-read rather than trust the removal. A rewrite that reported success
    # but did not take would otherwise ship the exception.
    if plutil -extract NSAppTransportSecurity xml1 -o - "$plist" >/dev/null 2>&1; then
        fail "NSAppTransportSecurity is still present in the packaged plist of a \
${CONFIGURATION:-unknown} build compiled for '${compiled_environment:-no environment}'"
    fi
fi

# ---------------------------------------------------------------------------
# Arbitrary loads, checked in every configuration
# ---------------------------------------------------------------------------
arbitrary="$(plutil -extract NSAppTransportSecurity.NSAllowsArbitraryLoads raw -o - \
    "$plist" 2>/dev/null || echo missing)"
if [ "$arbitrary" != "false" ] && [ "$arbitrary" != "0" ] && [ "$arbitrary" != "missing" ]; then
    fail "NSAllowsArbitraryLoads is '$arbitrary' in the packaged plist"
fi

for key in NSAllowsArbitraryLoadsInWebContent NSAllowsArbitraryLoadsForMedia \
    NSAllowsLocalNetworking; do
    if plutil -extract "NSAppTransportSecurity.$key" raw -o - "$plist" >/dev/null 2>&1; then
        fail "$key is present in the packaged plist. It relaxes transport security \
for a whole class of traffic rather than for one host."
    fi
done

# ---------------------------------------------------------------------------
# Privacy disclosures
# ---------------------------------------------------------------------------
purpose="$(plutil -extract NSFaceIDUsageDescription raw -o - "$plist" 2>/dev/null || true)"
if [ -z "$purpose" ]; then
    fail "NSFaceIDUsageDescription is missing or empty in the packaged plist. iOS \
terminates the process on the first Face ID evaluation without it."
fi

bundle="${TARGET_BUILD_DIR:-}/${WRAPPER_NAME:-}"
for language in en ar; do
    strings_file="$bundle/$language.lproj/InfoPlist.strings"
    if [ ! -f "$strings_file" ]; then
        fail "$language.lproj/InfoPlist.strings is not in the built bundle. The \
purpose string would fall back to the development language for every user \
reading that language."
    fi
    localized="$(plutil -extract NSFaceIDUsageDescription raw -o - "$strings_file" \
        2>/dev/null || true)"
    if [ -z "$localized" ]; then
        fail "$language.lproj/InfoPlist.strings carries no NSFaceIDUsageDescription"
    fi
done

echo "note: packaged bundle verified for ${CONFIGURATION:-unknown} / \
${compiled_environment:-UNSET}"
