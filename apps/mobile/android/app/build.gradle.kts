// Android application build configuration.
//
// THREE THINGS IN THIS FILE ARE SECURITY CONTROLS, NOT PREFERENCES
//
//   1. APPLICATION IDENTITY. `com.kararfinance.app` is the production
//      identifier. Non-production environments get a suffix so they install
//      side by side and can never be mistaken for the production app. Only
//      PRODUCTION is unsuffixed, and PRODUCTION must be asked for explicitly:
//      a build that says nothing is LOCAL, never production.
//
//   2. ENVIRONMENT. LOCAL / DEV / STAGING / PRODUCTION is BUILD configuration,
//      supplied at build time. There are no per-environment source sets, no
//      product flavors and no per-country variants: country and jurisdiction
//      are decided by backend policy, never by which binary the user installed.
//      An unrecognised environment fails the build rather than defaulting.
//
//   3. RELEASE SIGNING. No key, keystore or password is committed or generated
//      here. Signing material is supplied EXTERNALLY at release time. When it
//      is absent the release build type has NO signing configuration and Gradle
//      emits an unsigned artifact — it does NOT fall back to the debug key.
//      An unsigned release APK cannot be installed or uploaded, which is the
//      intended failure: shipping a release signed with the world-readable
//      debug key would be worse than shipping nothing.
//
// CANONICAL BUILD COMMANDS
//
//   Debug, local API:
//     flutter build apk --debug \
//       --dart-define=KARAR_ENV=LOCAL
//
//   Debug against the shared integration environment:
//     flutter build apk --debug -Pkarar.env=DEV \
//       --dart-define=KARAR_ENV=DEV \
//       --dart-define=KARAR_API_BASE_URL=https://<dev-host>
//
// `karar.env` and `--dart-define=KARAR_ENV` must agree. They are cross-checked
// below and a disagreement fails the build, so the packaged identity and the
// compiled configuration cannot drift apart.
import java.util.Base64
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/// The application id suffix for each profile. PRODUCTION is deliberately the
/// only empty entry: an unsuffixed artifact is a production artifact.
val environmentSuffixes: Map<String, String> =
    mapOf(
        "LOCAL" to ".local",
        "DEV" to ".dev",
        "STAGING" to ".staging",
        "PRODUCTION" to "",
    )

/// The environment requested through `-Pkarar.env`. Absent means LOCAL, which
/// is a developer default and can never be production.
val requestedEnvironment: String =
    (project.findProperty("karar.env") as String? ?: "LOCAL").trim().uppercase()

if (!environmentSuffixes.containsKey(requestedEnvironment)) {
    throw GradleException(
        "Unknown karar.env '$requestedEnvironment'. " +
            "Expected one of ${environmentSuffixes.keys.sorted().joinToString(", ")}.",
    )
}

/// Reads `KARAR_ENV` out of the dart-defines Flutter passes through, so the
/// packaged identity is checked against the configuration actually compiled
/// into the Dart code rather than trusted to match.
///
/// Returns null when the build was invoked through Gradle directly rather than
/// through the Flutter tool, in which case there is nothing to cross-check.
fun dartDefine(key: String): String? {
    val encoded = project.findProperty("dart-defines") as String? ?: return null
    val prefix = "$key="
    for (entry in encoded.split(",")) {
        val decoded: String =
            try {
                String(Base64.getDecoder().decode(entry.trim()))
            } catch (error: IllegalArgumentException) {
                // Not base64. The Flutter tool encodes every entry, so this is
                // not a define this build set; skip it rather than guess.
                continue
            }
        if (decoded.startsWith(prefix)) {
            val value = decoded.removePrefix(prefix).trim()
            return if (value.isEmpty()) null else value
        }
    }
    return null
}

fun dartDefinedEnvironment(): String? = dartDefine("KARAR_ENV")?.uppercase()

// LOCAL still cross-checks when dart-defines are present; the non-LOCAL rules
// below are stricter and require them.
if (requestedEnvironment == "LOCAL") {
    dartDefinedEnvironment()?.let { compiled ->
        if (compiled != requestedEnvironment) {
            throw GradleException(
                "Environment mismatch: the package is being built as '$requestedEnvironment' " +
                    "(-Pkarar.env) but the Dart code is compiled for '$compiled' " +
                    "(--dart-define=KARAR_ENV). These must be the same value.",
            )
        }
    }
}

/// A build for a deployed environment MUST carry the endpoint it talks to,
/// and MUST have been compiled for that environment.
///
/// The Dart configuration loader also rejects a missing, loopback, plain-HTTP
/// or credential-bearing base URL, so such a build fails closed at runtime into
/// CONFIG_INVALID rather than falling back to a development endpoint. That is
/// correct, but it is discovered on a device: the artifact is already produced,
/// signed and distributable, and it carries the PRODUCTION package identity
/// while being incapable of reaching any backend. A release that cannot work
/// should not be buildable.
///
/// The Dart guard alone is also not sufficient for a second reason. Invoking
/// Gradle DIRECTLY (`./gradlew assembleRelease -Pkarar.env=PRODUCTION`) passes
/// no dart-defines at all, so nothing is compiled for the environment and
/// nothing validates it. An earlier version of this check skipped validation
/// whenever dart-defines were absent, which made a direct invocation a complete
/// bypass. Absence is now the failure, not the exemption.
///
/// LOCAL is exempt: it has a documented default endpoint and is the only
/// environment a developer can build without arguments.
/// Extracts the host from an authority, correctly for IPv6.
///
/// `authority.substringBefore(':')` is wrong the moment the host is an IPv6
/// literal: RFC 3986 requires those to be bracketed, so `[::1]:8443` yields
/// `[` — which matches no rule, and let a PRODUCTION build with an `https://
/// [::1]:8443` endpoint succeed. Bracketing is the ONLY valid way to write an
/// IPv6 host in a URL, so before this the IPv6 loopback rules were unreachable
/// code that a source-presence test still reported as present.
///
/// The trailing dot is stripped too. `localhost.` is the fully-qualified form
/// of `localhost` and resolves identically, but equals neither.
fun hostOf(authority: String): String {
    val host =
        if (authority.startsWith("[")) {
            // Up to the closing bracket; the port, if any, follows it.
            authority.substringAfter('[').substringBefore(']')
        } else {
            authority.substringBefore(':')
        }
    return host.trimEnd('.')
}

fun rejectLocalOnlyHost(host: String, environment: String, url: String) {
    val lowered = host.lowercase()
    // An IPv6 literal may be written expanded, abbreviated, or with an
    // IPv4-mapped tail, and all of them reach the same interface. Compare on
    // the collapsed form rather than trying to enumerate the spellings.
    val collapsed = lowered.replace("0", "").replace(":", "")
    val isIpv6Loopback =
        (lowered.contains(':') && collapsed == "1") ||
            lowered == "::ffff:127.0.0.1" ||
            lowered == "::"
    val isLoopback =
        lowered == "localhost" ||
            lowered == "0.0.0.0" ||
            // The Android emulator's alias for the host machine.
            lowered == "10.0.2.2" ||
            lowered.startsWith("127.") ||
            isIpv6Loopback ||
            lowered.endsWith(".local") ||
            lowered.endsWith(".localhost") ||
            lowered.endsWith(".internal") ||
            lowered.endsWith(".test")
    if (isLoopback) {
        throw GradleException(
            "Local-only endpoint: a $environment build was given " +
                "KARAR_API_BASE_URL='$url', whose host '$host' resolves only on a " +
                "developer machine. A deployed build cannot reach it.",
        )
    }
}

if (requestedEnvironment != "LOCAL") {
    if (project.findProperty("dart-defines") == null) {
        throw GradleException(
            "Unconfigured $requestedEnvironment build: no dart-defines were passed, " +
                "so nothing was compiled for this environment and no endpoint was " +
                "supplied. This happens when Gradle is invoked directly rather than " +
                "through the Flutter tool. Build through `flutter build`, which " +
                "passes the compiled configuration, or build LOCAL.",
        )
    }

    val compiledEnvironment = dartDefinedEnvironment()
        ?: throw GradleException(
            "Missing environment: a $requestedEnvironment build must be given " +
                "--dart-define=KARAR_ENV, so the packaged identity and the compiled " +
                "configuration are the same environment rather than assumed to be.",
        )
    if (compiledEnvironment != requestedEnvironment) {
        throw GradleException(
            "Environment mismatch: the package is being built as '$requestedEnvironment' " +
                "(-Pkarar.env) but the Dart code is compiled for '$compiledEnvironment' " +
                "(--dart-define=KARAR_ENV). These must be the same value.",
        )
    }

    val baseUrl = dartDefine("KARAR_API_BASE_URL")
        ?: throw GradleException(
            "Missing endpoint: a $requestedEnvironment build must be given " +
                "--dart-define=KARAR_API_BASE_URL. Without it the application " +
                "compiles, packages and installs, then refuses to start because " +
                "no backend is configured. Supply the endpoint, or build LOCAL.",
        )
    if (!baseUrl.startsWith("https://")) {
        throw GradleException(
            "Insecure endpoint: a $requestedEnvironment build was given " +
                "KARAR_API_BASE_URL='$baseUrl', which is not https. Cleartext is " +
                "permitted only for the local loopback in debug builds.",
        )
    }

    // Authority = everything between the scheme and the first '/', '?' or '#'.
    val authority = baseUrl.removePrefix("https://").substringBefore('/')
        .substringBefore('?').substringBefore('#')
    if (authority.contains('@')) {
        throw GradleException(
            "Credentials in endpoint: a $requestedEnvironment build was given a " +
                "KARAR_API_BASE_URL containing userinfo before '@'. Credentials " +
                "embedded in a URL are shipped inside the artifact and readable by " +
                "anyone who unpacks it.",
        )
    }
    if (authority.isEmpty()) {
        throw GradleException(
            "Malformed endpoint: a $requestedEnvironment build was given " +
                "KARAR_API_BASE_URL='$baseUrl', which has no host.",
        )
    }
    rejectLocalOnlyHost(hostOf(authority), requestedEnvironment, baseUrl)
}

// ---------------------------------------------------------------------------
// Release signing — supplied externally, never committed
// ---------------------------------------------------------------------------

/// Optional signing material, read from `android/key.properties`.
///
/// That file is git-ignored and is NEVER created by this repository. It is
/// written by the release operator (or by a release pipeline from protected
/// storage) immediately before a release build and removed afterwards. See
/// key.properties.example for the expected keys.
///
/// Environment variables take precedence so a release pipeline can supply the
/// material without writing it to disk at all.
val signingProperties: Properties? =
    rootProject.file("key.properties").takeIf { it.exists() }?.let { file ->
        Properties().apply { file.inputStream().use { load(it) } }
    }

fun signingValue(propertyKey: String, environmentKey: String): String? =
    System.getenv(environmentKey)?.takeIf { it.isNotBlank() }
        ?: signingProperties?.getProperty(propertyKey)?.takeIf { it.isNotBlank() }

val releaseStoreFile: String? = signingValue("storeFile", "KARAR_ANDROID_KEYSTORE_PATH")
val releaseStorePassword: String? = signingValue("storePassword", "KARAR_ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias: String? = signingValue("keyAlias", "KARAR_ANDROID_KEY_ALIAS")
val releaseKeyPassword: String? = signingValue("keyPassword", "KARAR_ANDROID_KEY_PASSWORD")

val releaseSigningAvailable: Boolean =
    releaseStoreFile != null &&
        releaseStorePassword != null &&
        releaseKeyAlias != null &&
        releaseKeyPassword != null

android {
    namespace = "com.kararfinance.app"

    // Pinned to 37 rather than taking flutter.compileSdkVersion (36 in Flutter
    // 3.47.0). flutter_secure_storage 11.0.0 — the plugin that holds session
    // tokens in Keystore-backed storage — refuses to compile against anything
    // below 37, so with the Flutter default the Android build does not link at
    // all. AGP 9.1.0 warns that 36 is its maximum *recommended* compile SDK;
    // the warning is acknowledged in gradle.properties rather than silenced by
    // downgrading the security plugin.
    //
    // compileSdk only decides which APIs are available at compile time.
    // targetSdk below stays on the Flutter default, so no new runtime
    // behaviour is opted into by this line, and minSdk is untouched.
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Reverse-DNS identifier derived from the owned domain. Deliberately
        // carries no country code: one brand, one identifier, jurisdiction
        // decided server-side.
        applicationId = "com.kararfinance.app"
        applicationIdSuffix = environmentSuffixes.getValue(requestedEnvironment)
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        // Registered only when every piece of material is present. A partial
        // configuration is not a configuration.
        if (releaseSigningAvailable) {
            create("release") {
                storeFile = file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            // NO debug-key fallback. When signing material was not supplied the
            // artifact is unsigned and unusable, which is the correct outcome.
            signingConfig = if (releaseSigningAvailable) signingConfigs.getByName("release") else null
            isDebuggable = false
        }
        debug {
            // Gradle's generated debug key. Never used for anything but debug.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

if (!releaseSigningAvailable) {
    logger.lifecycle(
        "Karar: no release signing material supplied; release builds will be UNSIGNED. " +
            "Supply it through key.properties or the KARAR_ANDROID_* environment variables.",
    )
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
