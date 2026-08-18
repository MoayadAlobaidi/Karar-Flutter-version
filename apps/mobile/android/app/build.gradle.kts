// Android application build configuration.
//
// FOUR THINGS IN THIS FILE ARE SECURITY CONTROLS, NOT PREFERENCES
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
//   4. THE DATA-EXTRACTION RULES RESOURCE, which closes Android's backup and
//      device-transfer paths, is GENERATED here rather than committed. One of
//      its required attributes is an Apple Team ID — an identity this project
//      does not have. A LOCAL artifact declares an obviously and structurally
//      invalid one; a DEV, STAGING or PRODUCTION assembly refuses to produce an
//      artifact until a real one is supplied out of band. See the section under
//      "Data-extraction rules" below.
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
//       --dart-define=KARAR_API_BASE_URL=https://<dev-host> \
//       -Pkarar.ios.teamId=<apple-team-id>
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
// Data-extraction rules — generated, because one attribute is an IDENTITY
// ---------------------------------------------------------------------------

/// WHY THE RESOURCE IS GENERATED INSTEAD OF COMMITTED.
///
/// `@xml/data_extraction_rules` is what closes Android's backup and transfer
/// paths. `android:allowBackup="false"` is not enough on its own: for
/// an application running on and targeting API 31 or higher, Android documents
/// that it disables cloud backup but "doesn't disable device-to-device
/// transfers for the app". targetSdk is the Flutter default (36), so the gap is
/// live here, and a missing section is documented as fully enabled for all
/// content rather than off. All three sections are therefore declared and every
/// one of the nine documented domains is excluded from each.
///
/// The public application contract for that resource requires
/// `<platform-specific-params>` on `<cross-platform-transfer>`, carrying
/// `bundleId`, `teamId` and `contentVersion`. `teamId` is an APPLE TEAM ID: an
/// identity issued to one specific Apple developer account. This project has
/// none. A single committed file would therefore have to carry either a
/// fabricated identity or no element at all, and both were rejected on review —
/// the first puts an invented identity into a shipping artifact, the second
/// omits an element the contract requires.
///
/// Generating dissolves the choice. A LOCAL artifact declares an identity that
/// is obviously fake to a reader AND structurally rejected by the validator a
/// deployed build applies; a DEV, STAGING or PRODUCTION ASSEMBLY refuses to
/// produce an artifact at all until a real Team ID is supplied out of band.
/// Nothing in this repository ever holds one.
///
/// The refusal is in the task ACTION, not at configuration time, and that is
/// deliberate. `./gradlew :app:tasks -Pkarar.env=PRODUCTION` is how the
/// endpoint guards above are proven in CI; making a missing Team ID a
/// configuration failure would break every such invocation, including ones that
/// assemble nothing. What must not exist is an ARTIFACT, so the failure belongs
/// where the artifact is produced.

/// The Apple Team ID for the iOS counterpart, supplied out of band.
///
/// Same shape as the signing material below: the environment variable wins, so
/// a release pipeline can supply the value without it touching disk, and the
/// Gradle property is the interactive equivalent. Neither has a default, and no
/// committed file in this repository carries a real value. This is
/// CONFIGURATION, not a secret — a Team ID is printed on every artifact Apple
/// distributes — but it is an identity, and an identity that is not ours must
/// not be guessable from anything checked in.
val suppliedAppleTeamId: Provider<String> =
    providers.environmentVariable("KARAR_IOS_TEAM_ID")
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .orElse(
            providers.gradleProperty("karar.ios.teamId")
                .map { it.trim() }
                .filter { it.isNotEmpty() },
        )

/// Writes the data-extraction rules resource for one variant.
///
/// Everything the resource declares is produced from the lists below, so a
/// section cannot silently omit a domain: the sections and the domains are a
/// product, not nine lines repeated three times and hand-maintained.
abstract class GenerateDataExtractionRules : DefaultTask() {
    /// The build profile this resource is being generated for.
    @get:Input
    abstract val profile: Property<String>

    /// The bundle identifier of the iOS counterpart a deployed artifact names.
    ///
    /// Wired to the variant's own applicationId, which already carries the
    /// environment suffix. The iOS project declares the same identifier and the
    /// same suffix scheme (`com.kararfinance.app$(KARAR_BUNDLE_ID_SUFFIX)`), so
    /// this is the project's own owned identifier rather than a new invention.
    /// It is not used for LOCAL, which declares the test-only value instead.
    ///
    /// NOT CLAIMED: that the two agree today. The iOS xcconfigs currently leave
    /// KARAR_BUNDLE_ID_SUFFIX empty for every configuration, so an iOS build
    /// produces `com.kararfinance.app` whatever it is built for, while a DEV
    /// artifact names `com.kararfinance.app.dev`. Hardcoding the unsuffixed
    /// identifier here would be worse, not better: a DEV artifact would then
    /// name the PRODUCTION counterpart. Naming a counterpart that does not exist
    /// yet is the smaller error, and the section excludes every domain either
    /// way. The iOS suffix is a separate packaging gap, recorded as such.
    @get:Input
    abstract val counterpartBundleId: Property<String>

    /// The Apple Team ID, when one was supplied.
    ///
    /// Optional HERE so that its absence produces the stated message below
    /// rather than Gradle's "no value has been specified for property", which
    /// names an internal property and tells an operator nothing about what to
    /// do next.
    @get:Input
    @get:Optional
    abstract val appleTeamId: Property<String>

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    /// The constants below are task INPUTS, not just constants, so that editing
    /// one of them re-runs the task. Without this an edit to the domain list
    /// would leave a previously generated resource in place and up to date,
    /// which is the one failure mode a generated security control must not have.
    @get:Input
    val declaredSections: List<String> get() = SECTIONS

    @get:Input
    val excludedDomains: List<String> get() = DOMAINS

    @get:Input
    val wholeDomainPath: String get() = WHOLE_DOMAIN_PATH

    @get:Input
    val crossPlatformTarget: String get() = CROSS_PLATFORM_TARGET

    @get:Input
    val testOnlyIdentity: List<String>
        get() = listOf(TEST_ONLY_BUNDLE_ID, TEST_ONLY_TEAM_ID, TEST_ONLY_CONTENT_VERSION)

    @TaskAction
    fun generate() {
        val environment = profile.get()
        val document = render(environment)

        // BELT AND BRACES. The branch in `platformSpecificParams` is what keeps
        // the test-only identity out of a deployed artifact; this is the check
        // that the branch actually did. It costs one string search and turns a
        // future editing mistake into a failed build rather than a shipped
        // artifact claiming an identity that was never meant to leave a laptop.
        if (environment != TEST_ONLY_ENVIRONMENT && document.contains(TEST_ONLY_TEAM_ID)) {
            throw GradleException(
                "Test-only identity in a $environment artifact: the generated " +
                    "data-extraction rules contain '$TEST_ONLY_TEAM_ID', which exists " +
                    "only so a LOCAL build has something plainly fake to declare. " +
                    "Reaching a deployed artifact means the environment branch in " +
                    "GenerateDataExtractionRules was bypassed.",
            )
        }

        val directory = outputDirectory.get().asFile.resolve("xml")
        directory.mkdirs()
        directory.resolve("data_extraction_rules.xml").writeText(document)
    }

    /// The whole resource, sections outer and domains inner.
    private fun render(environment: String): String {
        val document = StringBuilder()
        document.append("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n")
        document.append(header(environment))
        document.append("<data-extraction-rules>\n")
        for (section in SECTIONS) {
            val isCrossPlatform = section == CROSS_PLATFORM_SECTION
            val opening =
                if (isCrossPlatform) "$section platform=\"$CROSS_PLATFORM_TARGET\"" else section
            document.append("    <$opening>\n")
            if (isCrossPlatform) {
                document.append("        ${platformSpecificParams(environment)}\n")
            }
            for (domain in DOMAINS) {
                document.append(
                    "        <exclude domain=\"$domain\" path=\"$WHOLE_DOMAIN_PATH\" />\n",
                )
            }
            document.append("    </$section>\n")
        }
        document.append("</data-extraction-rules>\n")
        return document.toString()
    }

    /// The provenance header. `karar.env` is machine-readable on purpose: it is
    /// what lets the security suite say WHICH profile produced a given
    /// generated resource, and therefore whether the test-only identity in it
    /// is expected or is a finding.
    private fun header(environment: String): String =
        """
        <!--
          GENERATED FILE. DO NOT EDIT, AND DO NOT COMMIT.

          Written by GenerateDataExtractionRules in app/build.gradle.kts, which
          carries the reasoning, the citations and the fail closed rules. Editing
          this copy changes nothing: the next assembly overwrites it.

          karar.env = $environment
        -->
        """.trimIndent() + "\n"

    /// The element that names the iOS counterpart, and the only place an
    /// identity enters this resource.
    private fun platformSpecificParams(environment: String): String {
        if (environment == TEST_ONLY_ENVIRONMENT) {
            return params(TEST_ONLY_BUNDLE_ID, TEST_ONLY_TEAM_ID, TEST_ONLY_CONTENT_VERSION)
        }

        val supplied = appleTeamId.orNull?.trim().orEmpty()
        if (supplied.isEmpty()) {
            throw GradleException(
                "Missing Apple Team ID: a $environment artifact declares " +
                    "<platform-specific-params>, whose teamId identifies the iOS " +
                    "counterpart this application's data may be matched to. No Team ID " +
                    "is configured, and none is committed to this repository.\n" +
                    "\n" +
                    "Supply it out of band, as with the release signing material:\n" +
                    "\n" +
                    "  KARAR_IOS_TEAM_ID=<10-character Apple Team ID>   (preferred)\n" +
                    "  -Pkarar.ios.teamId=<10-character Apple Team ID>\n" +
                    "\n" +
                    "or build LOCAL, which declares a test-only identity that a " +
                    "deployed artifact cannot carry.",
            )
        }

        // The same validator that rejects a typo also rejects the test-only
        // value: TEST_ONLY_TEAM_ID cannot match this pattern, so supplying it
        // by hand to a deployed build fails here rather than shipping.
        if (!APPLE_TEAM_ID.matches(supplied)) {
            throw GradleException(
                "Malformed Apple Team ID: a $environment build was given '$supplied'. An " +
                    "Apple Team ID is exactly 10 characters, uppercase letters and " +
                    "digits. The value supplied is not one, so it would put an identity " +
                    "nothing can match into a deployed artifact — which looks configured " +
                    "and is inert.",
            )
        }

        return params(counterpartBundleId.get(), supplied, COUNTERPART_CONTENT_VERSION)
    }

    private fun params(bundleId: String, teamId: String, contentVersion: String): String =
        "<platform-specific-params bundleId=\"$bundleId\" teamId=\"$teamId\" " +
            "contentVersion=\"$contentVersion\" />"

    private companion object {
        /// Every extraction mode the framework defines. A mode with no section
        /// is not off: Android documents a missing section as fully enabled for
        /// all content, so all three are declared and all three are emptied.
        val SECTIONS =
            listOf("cloud-backup", "device-transfer", "cross-platform-transfer")

        const val CROSS_PLATFORM_SECTION = "cross-platform-transfer"

        /// Every domain the rules can name. `root` and `device_root` cover the
        /// internal storage roots, `external` is outside them, and the
        /// device-protected (Direct Boot) domains are a separate tree from the
        /// credential-protected ones. Listing all nine costs nothing and removes
        /// the question of which one subsumes which.
        val DOMAINS =
            listOf(
                "root",
                "file",
                "database",
                "sharedpref",
                "external",
                "device_root",
                "device_file",
                "device_database",
                "device_sharedpref",
            )

        /// WHY `.` AND NOT `./`.
        ///
        /// Both name the whole domain directory, and at RUNTIME they are the
        /// same exclusion: FullBackup.parseIncludeExcludeTag stores
        /// `new File(domainDirectory, path).getCanonicalPath()`, and
        /// canonicalisation collapses `dir/.` and `dir/./` to `dir`.
        ///
        /// They are not the same to LINT. FullBackupContentDetector.validatePath
        /// reports "Subdirectories are not allowed for domain `sharedpref`" for
        /// any path containing `/` in the sharedpref and database domains, and
        /// the FullBackupContent issue is FATAL — so `./` fails
        /// lintVitalRelease and NO release artifact can be produced at all.
        /// `sharedpref` is exactly where the session tokens live, so this is not
        /// a corner of the resource that could simply be left alone.
        ///
        /// `.` carries the same meaning past both, and unlike omitting the
        /// attribute it states the scope rather than relying on the parser's
        /// null handling.
        const val WHOLE_DOMAIN_PATH = "."

        /// The only cross-platform target the framework names anywhere:
        /// BackupAgent.FLAG_CROSS_PLATFORM_DATA_TRANSFER_IOS, documented as "a
        /// cross-platform transfer to or from iOS". Nothing rejects a wrong
        /// value — FullBackup reads the attribute as an opaque string and uses
        /// it as a map key — so a misspelling would build, lint, ship, and
        /// address a platform nobody transfers to.
        const val CROSS_PLATFORM_TARGET = "ios"

        const val TEST_ONLY_ENVIRONMENT = "LOCAL"

        /// THE TEST-ONLY IDENTITY, AND WHY IT IS SHAPED LIKE THIS.
        ///
        /// It has to be readable as fake by a person dumping the resource out
        /// of an APK, and it has to be impossible for a deployed build to carry
        /// even if someone passes it deliberately. The second property is the
        /// one that matters, and it is structural rather than a matter of
        /// naming: an Apple Team ID is exactly ten uppercase alphanumerics, this
        /// value is neither ten characters nor alphanumeric, and every deployed
        /// build runs every supplied value through APPLE_TEAM_ID.
        const val TEST_ONLY_TEAM_ID = "TEST-ONLY-NOT-AN-APPLE-TEAM-ID"
        const val TEST_ONLY_BUNDLE_ID = "invalid.test-only.no-ios-counterpart-exists"
        const val TEST_ONLY_CONTENT_VERSION = "0-test-only"

        /// The content version a deployed artifact declares for its counterpart.
        /// The framework treats it as an opaque string; it is stated so the
        /// element is complete rather than partially filled in.
        const val COUNTERPART_CONTENT_VERSION = "1"

        /// An Apple Team ID, as Apple issues them: ten characters, uppercase
        /// letters and digits.
        val APPLE_TEAM_ID = Regex("^[A-Z0-9]{10}$")
    }
}

androidComponents {
    onVariants { variant ->
        val capitalisedVariant =
            variant.name.replaceFirstChar { character -> character.uppercaseChar() }
        val generateRules =
            tasks.register<GenerateDataExtractionRules>(
                "generate${capitalisedVariant}DataExtractionRules",
            ) {
                profile.set(requestedEnvironment)
                counterpartBundleId.set(variant.applicationId)
                appleTeamId.set(suppliedAppleTeamId)
            }
        // AGP wires the output directory and the task dependency itself. Adding
        // the directory to `sourceSets` by hand instead is what produces a
        // resource that is merged on one invocation and missing on the next.
        //
        // `sources.res` is nullable because a variant can have resources
        // switched off entirely. That is not a case to tolerate quietly here: it
        // would leave `@xml/data_extraction_rules` unresolvable, so it fails
        // with a sentence instead of a null-pointer trace.
        val resourceSources =
            variant.sources.res
                ?: throw GradleException(
                    "Variant '${variant.name}' has no res source set, so the generated " +
                        "data-extraction rules resource has nowhere to go and the " +
                        "manifest's @xml/data_extraction_rules reference cannot resolve.",
                )
        resourceSources.addGeneratedSourceDirectory(
            generateRules,
            GenerateDataExtractionRules::outputDirectory,
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

    lint {
        // WITHOUT THIS LINE, MOVING THE DATA-EXTRACTION RULES TO A GENERATED
        // RESOURCE SILENTLY REMOVED THE ONLY GATE THAT EVER CAUGHT A DEFECT IN
        // THEM.
        //
        // `checkGeneratedSources` defaults to false, so lint skips anything
        // under a generated source directory. The FullBackupContent issue is
        // FATAL and lintVitalRelease is what once caught `<cross-platform-
        // transfer>` with no `platform` attribute — a broken release build that
        // no debug assembly and no source test noticed. Generating the resource
        // put it out of lint's reach: with this flag off, a release assembly of
        // a rules resource missing that same attribute succeeds.
        //
        // Verified by injecting exactly that defect: `lintVitalRelease` passed
        // with the flag off and fails with it on.
        checkGeneratedSources = true
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
