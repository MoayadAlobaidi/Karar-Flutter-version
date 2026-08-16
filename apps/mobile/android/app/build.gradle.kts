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
fun dartDefinedEnvironment(): String? {
    val encoded = project.findProperty("dart-defines") as String? ?: return null
    for (entry in encoded.split(",")) {
        val decoded: String =
            try {
                String(Base64.getDecoder().decode(entry.trim()))
            } catch (error: IllegalArgumentException) {
                // Not base64. The Flutter tool encodes every entry, so this is
                // not a define this build set; skip it rather than guess.
                continue
            }
        if (decoded.startsWith("KARAR_ENV=")) {
            val value = decoded.removePrefix("KARAR_ENV=").trim().uppercase()
            return if (value.isEmpty()) null else value
        }
    }
    return null
}

dartDefinedEnvironment()?.let { compiled ->
    if (compiled != requestedEnvironment) {
        throw GradleException(
            "Environment mismatch: the package is being built as '$requestedEnvironment' " +
                "(-Pkarar.env) but the Dart code is compiled for '$compiled' " +
                "(--dart-define=KARAR_ENV). These must be the same value.",
        )
    }
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
