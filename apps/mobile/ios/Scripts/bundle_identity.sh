# THE ENVIRONMENT TO BUNDLE IDENTIFIER RULE, WRITTEN DOWN ONCE.
#
# Sourced by verify_packaged_bundle.sh, and read as data by the security suite
# (test/security/support/bundle_identity.dart), which proves that the map below
# is character-for-character the same rule as `environmentSuffixes` in
# android/app/build.gradle.kts. Two platforms that each spell out their own
# suffix table agree until the day one of them is edited; a table that is
# asserted equal to the other one cannot drift silently.
#
# The rule itself is Android's, and deliberately so: `applicationIdSuffix` has
# been deriving the Android identity from `-Pkarar.env` since the first build,
# and the Android artifact is the one whose data-extraction rules NAME the iOS
# counterpart. This file is the iOS end of that same statement, not a second
# opinion about it.
#
# WHY A SHELL FILE AND NOT AN XCCONFIG.
#
# Xcode resolves PRODUCT_BUNDLE_IDENTIFIER from build settings before any build
# phase runs, and an xcconfig cannot see which ENVIRONMENT a build was compiled
# for. The Flutter tool does forward the dart-defines into the Xcode build, but
# only as DART_DEFINES: one comma-separated list of base64-encoded KEY=VALUE
# entries. xcconfig has no string functions at all, let alone a base64 decoder,
# so that value is opaque to it — which is why Release.xcconfig used to record
# the whole problem as unsolved and leave every artifact carrying the production
# identifier. A shell script CAN decode it, so the rule lives where the decoder
# is.
#
# CANONICAL BUILD COMMANDS. One codebase, four environments, no product
# flavors, no per-country variant, no per-environment source set. Brand and
# environment stay separate dimensions: nothing below selects a brand, and
# nothing below selects a country.
#
#   LOCAL       (com.kararfinance.app.local)
#     flutter build ios --simulator --debug \
#       --dart-define=KARAR_ENV=LOCAL
#
#   DEV         (com.kararfinance.app.dev)
#     flutter build ios --simulator --debug \
#       --dart-define=KARAR_ENV=DEV \
#       --dart-define=KARAR_API_BASE_URL=https://<dev-host>
#
#   STAGING     (com.kararfinance.app.staging)
#     flutter build ios --simulator --debug \
#       --dart-define=KARAR_ENV=STAGING \
#       --dart-define=KARAR_API_BASE_URL=https://<staging-host>
#
#   PRODUCTION  (com.kararfinance.app)
#     flutter build ios --release --no-codesign \
#       --dart-define=KARAR_ENV=PRODUCTION \
#       --dart-define=KARAR_API_BASE_URL=https://<production-host>
#
# `--simulator --debug` and `--release` are the Xcode CONFIGURATION and are a
# different axis from the environment: `--debug --dart-define=KARAR_ENV=DEV` is
# a Debug build of a deployed environment and gets `.dev`, not `.local`. Any of
# the four environments can be built in any configuration, and the identifier
# follows the environment every time.
#
# `--no-codesign` is not a property of PRODUCTION; it is a property of this
# repository, which holds no signing identity and no Apple Team ID. See the
# refusal in verify_packaged_bundle.sh for what happens the day one exists.

# The production identifier, and the only one with no suffix. It is the owned
# reverse-DNS name and carries no country code: jurisdiction is decided by
# backend policy, never by which binary was installed.
KARAR_BASE_BUNDLE_ID="com.kararfinance.app"

# Every environment there is. Enumerated rather than inferred so that the
# caller can check a value it did NOT choose — verify_packaged_bundle.sh walks
# this list to prove the xcconfig seed is one of the four identifiers and not a
# typo that happens to start with the owned prefix.
KARAR_ENVIRONMENTS="LOCAL DEV STAGING PRODUCTION"

# The suffix for one environment, or a non-zero exit for anything else.
#
# PRODUCTION is the empty entry, and that is the whole safety property: an
# unsuffixed artifact is a production artifact, so production has to be asked
# for by name. An unrecognised environment returns failure rather than falling
# back to the empty string, because falling back to the empty string is exactly
# "everything unknown is production".
karar_bundle_id_suffix() {
    case "$1" in
        LOCAL) printf '%s' ".local" ;;
        DEV) printf '%s' ".dev" ;;
        STAGING) printf '%s' ".staging" ;;
        PRODUCTION) printf '%s' "" ;;
        *) return 1 ;;
    esac
}

# The full identifier for one environment, or a non-zero exit for anything else.
karar_bundle_identifier() {
    karar_identity_suffix="$(karar_bundle_id_suffix "$1")" || return 1
    printf '%s%s' "$KARAR_BASE_BUNDLE_ID" "$karar_identity_suffix"
}
