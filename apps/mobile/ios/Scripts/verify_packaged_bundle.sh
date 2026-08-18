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
# IT ALSO SETTLES THE BUNDLE IDENTIFIER, FOR THE SAME REASON.
#
# `PRODUCT_BUNDLE_IDENTIFIER` is resolved by Xcode from build settings, and an
# xcconfig cannot decode DART_DEFINES, so the xcconfig can only ever state a
# DEFAULT per configuration — Debug means LOCAL, Release means PRODUCTION —
# which is right for the ordinary case and wrong for every build that crosses
# the two axes. This phase knows the compiled environment, so it is the only
# place the identifier can be settled against it. It derives the expected
# identifier from the shared rule in Scripts/bundle_identity.sh, narrows the
# packaged plist to it, re-reads to confirm, and fails the build on a missing
# environment, an unknown environment, a seed that is not one of the four
# identifiers, or a final value that is not what the environment says it must
# be. There is no path through this section that leaves a DEV, STAGING or LOCAL
# artifact carrying `com.kararfinance.app`.
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
# Bundle identity
# ---------------------------------------------------------------------------
#
# The rule is not written here. It is sourced, and the file it comes from is
# asserted equal to the Android suffix table by the security suite, so the two
# platforms cannot come to disagree about what a DEV artifact is called.
identity_rules="${SRCROOT:-}/Scripts/bundle_identity.sh"
[ -f "$identity_rules" ] || fail "$identity_rules is missing. It carries the \
environment-to-bundle-identifier rule, and without it this phase cannot say \
what the artifact should be called."
. "$identity_rules"

# ABSENCE IS NOT PRODUCTION, AND IT IS NOT LOCAL EITHER.
#
# The ATS section below can afford to treat an undetermined environment as
# "grant nothing", because the artifact starts without the exception and the
# safe answer is to leave it that way. An identifier has no such safe answer:
# the artifact starts WITH one, whatever the xcconfig seeded, and every possible
# value names some real environment. So the build stops.
[ -n "$compiled_environment" ] || fail "Missing environment: this build passed \
no --dart-define=KARAR_ENV, so nothing says which environment the artifact is \
for and its bundle identifier cannot be derived. An artifact that does not know \
what it is must not be produced: pass --dart-define=KARAR_ENV=LOCAL (or DEV, \
STAGING, PRODUCTION). The Dart configuration loader has no default for it \
either, so such a build would reach CONFIG_INVALID at startup."

expected_identifier="$(karar_bundle_identifier "$compiled_environment")" \
    || fail "Unknown environment: this build was compiled for \
'$compiled_environment', which is not one of $KARAR_ENVIRONMENTS. An \
unrecognised environment is refused rather than given the unsuffixed \
identifier, which is production's."

# WHAT THE BUILD SETTINGS ASKED FOR, BEFORE THIS PHASE TOUCHES ANYTHING.
#
# Checked against the rule rather than merely read, because a typo in an
# xcconfig — `.stagng`, or a suffix left on a Release configuration — produces
# an identifier that still starts with the owned prefix and would otherwise be
# silently overwritten here and never noticed. The seed must be one of the four
# real identifiers; which one it is, is the configuration's default and is
# allowed to differ from the compiled environment.
seed_identifier="${PRODUCT_BUNDLE_IDENTIFIER:-}"
seed_is_an_identity=0
for candidate_environment in $KARAR_ENVIRONMENTS; do
    if [ "$seed_identifier" = "$(karar_bundle_identifier "$candidate_environment")" ]; then
        seed_is_an_identity=1
    fi
done
[ "$seed_is_an_identity" -eq 1 ] || fail "PRODUCT_BUNDLE_IDENTIFIER is \
'$seed_identifier', which is not an identifier this project issues. The \
xcconfig seed must be one of the identifiers $KARAR_ENVIRONMENTS map to under \
Scripts/bundle_identity.sh; anything else is a typo that would be overwritten \
here and never seen."

packaged_identifier="$(plutil -extract CFBundleIdentifier raw -o - "$plist" \
    2>/dev/null || true)"
[ "$packaged_identifier" = "$seed_identifier" ] || fail "the packaged plist \
declares CFBundleIdentifier '$packaged_identifier' but the build settings \
resolved PRODUCT_BUNDLE_IDENTIFIER to '$seed_identifier'. Something between \
Xcode writing the plist and this phase reading it rewrote the identity, and \
this phase must not narrow a value whose provenance it cannot account for."

if [ "$packaged_identifier" != "$expected_identifier" ]; then
    # THE ONE THING THAT MAKES THIS UNSOUND IS A PROVISIONING PROFILE.
    #
    # Xcode selects the profile from PRODUCT_BUNDLE_IDENTIFIER, at build
    # settings time, before this phase exists. Narrowing the packaged
    # identifier afterwards would leave the artifact claiming an identity its
    # own profile does not cover, which installs nowhere and is discovered on a
    # device rather than here. Every artifact this repository produces today is
    # unsigned or ad-hoc signed and has neither a team nor a profile, so this
    # never fires — but the day a real Apple Team ID exists, this phase stops
    # being the right mechanism and the refusal says so instead of shipping a
    # broken artifact.
    if [ -n "${DEVELOPMENT_TEAM:-}" ] || [ -n "${PROVISIONING_PROFILE_SPECIFIER:-}" ]; then
        fail "Cross-platform identity is not configured for signed builds: this \
$compiled_environment build must carry '$expected_identifier' but its build \
settings resolved '$seed_identifier', and it is signed against team \
'${DEVELOPMENT_TEAM:-}' / profile '${PROVISIONING_PROFILE_SPECIFIER:-}'. \
Correcting the identifier here would desynchronise the artifact from the \
profile that was chosen for it. A signed build needs per-environment Xcode \
configurations and per-environment App Store records, and both need a real \
Apple Team ID — which this repository does not hold and must not invent. Build \
unsigned, or supply the Team ID out of band and do that work."
    fi

    plutil -replace CFBundleIdentifier -string "$expected_identifier" "$plist" \
        || fail "could not set CFBundleIdentifier to '$expected_identifier' in \
the packaged plist"
    echo "note: narrowed the packaged bundle identifier from \
'$packaged_identifier' to '$expected_identifier' for a $compiled_environment \
build in the ${CONFIGURATION:-unknown} configuration"
fi

# Re-read rather than trust the write, on the same rule as the ATS removal
# below: a rewrite that reported success and did not take would otherwise ship
# the wrong identity. This also covers the branch that did NOT rewrite, so the
# final value is asserted on every path rather than only on the corrected one.
final_identifier="$(plutil -extract CFBundleIdentifier raw -o - "$plist" \
    2>/dev/null || true)"
[ "$final_identifier" = "$expected_identifier" ] || fail "the packaged plist \
declares CFBundleIdentifier '$final_identifier' for a $compiled_environment \
build, which must be '$expected_identifier'. The compiled environment and the \
packaged identity have to be the same statement."

# ---------------------------------------------------------------------------
# The endpoint a deployed build was compiled with
# ---------------------------------------------------------------------------
#
# The Android build refuses to produce a DEV, STAGING or PRODUCTION package
# without a usable endpoint, on the grounds that such an artifact carries the
# real package identity, is distributable, and can never work. iOS had no
# equivalent: the same `flutter build ipa --dart-define=KARAR_ENV=PRODUCTION`
# with no endpoint produced a complete PRODUCTION IPA. One platform refused
# and the other shipped.
#
# These are the same rules as android/app/build.gradle.kts, deliberately, so
# the two platforms cannot drift into disagreeing about what is buildable.
compiled_base_url=""
if [ -n "${DART_DEFINES:-}" ]; then
    for entry in $(printf '%s' "$DART_DEFINES" | tr ',' ' '); do
        decoded="$(printf '%s' "$entry" | base64 -D 2>/dev/null || true)"
        case "$decoded" in
            KARAR_API_BASE_URL=*)
                compiled_base_url="${decoded#KARAR_API_BASE_URL=}"
                ;;
        esac
    done
fi

if [ -n "$compiled_environment" ] && [ "$compiled_environment" != "LOCAL" ]; then
    [ -n "$compiled_base_url" ] || fail "Missing endpoint: a \
$compiled_environment build was compiled with no KARAR_API_BASE_URL. It would \
carry the $compiled_environment package identity and be unable to reach any \
API. Pass --dart-define=KARAR_API_BASE_URL=https://..."

    case "$compiled_base_url" in
        https://*) ;;
        *) fail "Insecure endpoint: a $compiled_environment build was given \
KARAR_API_BASE_URL='$compiled_base_url'. A deployed build must use https." ;;
    esac

    authority="${compiled_base_url#https://}"
    authority="${authority%%/*}"
    authority="${authority%%\?*}"
    authority="${authority%%#*}"

    case "$authority" in
        *@*) fail "Credentials in endpoint: a $compiled_environment build was \
given a KARAR_API_BASE_URL containing userinfo before '@'. Credentials \
embedded in a URL ship inside the artifact." ;;
    esac
    [ -n "$authority" ] || fail "Malformed endpoint: a $compiled_environment \
build was given KARAR_API_BASE_URL='$compiled_base_url', which has no host."

    # An IPv6 literal is bracketed in a URL, so splitting on the first colon
    # would yield '['. The trailing dot is stripped because `localhost.` is the
    # fully-qualified form of `localhost` and resolves identically.
    case "$authority" in
        \[*) host="${authority#\[}"; host="${host%%\]*}" ;;
        *)   host="${authority%%:*}" ;;
    esac
    host="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')"
    while :; do
        case "$host" in *.) host="${host%.}" ;; *) break ;; esac
    done

    local_only=0
    case "$host" in
        localhost|0.0.0.0|10.0.2.2) local_only=1 ;;
        127.*) local_only=1 ;;
        ::ffff:127.0.0.1|::) local_only=1 ;;
        *.local|*.localhost|*.internal|*.test) local_only=1 ;;
    esac
    # Any spelling of the IPv6 loopback: strip zeroes and colons and see if a
    # lone 1 remains, which covers ::1 and 0:0:0:0:0:0:0:1 alike.
    case "$host" in
        *:*)
            if [ "$(printf '%s' "$host" | tr -d '0:')" = "1" ]; then
                local_only=1
            fi
            ;;
    esac
    [ "$local_only" -eq 0 ] || fail "Local-only endpoint: a \
$compiled_environment build was given KARAR_API_BASE_URL='$compiled_base_url', \
whose host '$host' resolves only on a developer machine."
fi

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
${compiled_environment:-UNSET} as '$final_identifier'"
