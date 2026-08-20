// THE ANDROID HALF OF THE DOCUMENT PICKER, AND THE PERMISSION ARGUMENT FOR IT.
//
// This asks the system for ONE DOCUMENT. It does not ask for storage.
//
// ACTION_OPEN_DOCUMENT is served by the system document provider UI, which
// returns a content URI carrying a read grant for the single file the person
// selected, scoped to this process and revoked when the task ends. It requires
// NO manifest permission whatsoever. That is the whole reason this file exists
// instead of a file-picker dependency: the merged-manifest allow-list in
// test/security/platform_hardening_test.dart names the exact permission set of
// a real build, and a library that contributed a storage or media permission
// to read one chosen file would be the wrong trade.
//
// WHAT THIS FILE DELIBERATELY NEVER DOES:
//
//   * it declares and requests no permission — not the legacy external-storage
//     pair, not the scoped media ones, not the all-files manage permission.
//     There is no requestPermissions call here and none is needed;
//   * it never opens a directory. ACTION_OPEN_DOCUMENT_TREE would grant access
//     to a whole subtree, which is access to files nobody chose;
//   * it takes NO persistable URI grant. FLAG_GRANT_PERSISTABLE_URI_PERMISSION
//     is not set and takePersistableUriPermission is not called, so the grant
//     dies with the task and this application cannot read the file again later;
//   * it copies the file nowhere. The bytes are read into memory, handed to
//     Dart, and dropped. No cache file, no application-support copy;
//   * it returns NO filename and NO path. The Dart port has no field for either
//     and the platform stores neither, so a name could only ever be logged or
//     displayed — and a bank's export is routinely named after the account it
//     belongs to. The same rule governs failures: an error carries a code and
//     nothing else, because a platform message routinely contains the path.
//
// DEVICE EXECUTION IS NOT VERIFIED. Nothing in this repository has run this
// code on a physical device or an emulator. It compiles, its channel contract
// is asserted from Dart against the framework's mock messenger, and its names
// are asserted against the Dart constants by a source-level test. Behaviour
// against a real document provider is unverified and must not be described as
// anything else.
package com.kararfinance.app

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Presents the system document picker and reads the chosen file, once.
 *
 * The host activity owns the lifecycle: it supplies the launcher, forwards the
 * chosen URI, and detaches when the engine goes away.
 */
internal class StatementDocumentPicker : MethodChannel.MethodCallHandler {

    internal companion object {
        /**
         * Must match `documentPickerChannelName` in
         * lib/features/statement_imports/data/platform_statement_source_picker.dart.
         * A fixed literal, deliberately not derived from the application id:
         * the id carries a per-environment suffix and a channel that moved with
         * it would be a configuration bug visible only at runtime.
         */
        const val CHANNEL = "com.kararfinance.app/document_picker"

        /** The one method this channel answers. */
        const val METHOD_PICK = "pickCsvSource"

        /** The byte bound, supplied by Dart. See the note on [readAtMost]. */
        const val ARG_MAX_BYTES = "maxBytes"

        const val KEY_BYTES = "bytes"
        const val KEY_MEDIA_TYPE = "mediaType"

        const val CODE_UNAVAILABLE = "PICKER_UNAVAILABLE"
        const val CODE_UNREADABLE = "SOURCE_UNREADABLE"
        const val CODE_BUSY = "PICKER_BUSY"
        const val CODE_INVALID_REQUEST = "INVALID_REQUEST"

        /**
         * The types offered to the document provider.
         *
         * CONVENIENCE, NOT A CONTROL. A provider may ignore the filter, a file
         * may be mislabelled, and a person may rename a spreadsheet. The
         * platform decides what the content actually is by inspecting it and
         * refuses archives, spreadsheets and binaries on that basis; nothing
         * downstream trusts a document because the picker offered it.
         *
         * `text/plain` is present because CSV exports are routinely served
         * under it, and a filter that hid a person's real statement would be a
         * worse failure than showing one file too many.
         */
        val ACCEPTED_MIME_TYPES = arrayOf(
            "text/csv",
            "text/comma-separated-values",
            "application/csv",
            "text/plain",
        )

        // The intent type: the any-type wildcard. REQUIRED rather than lazy.
        // The platform documents EXTRA_MIME_TYPES as the way to state a set of
        // acceptable types, and documents that the intent's own type must be
        // the wildcard when that extra is used. Narrowing it here instead would
        // silently drop the extra list on the providers that honour it, leaving
        // a filter that is both stricter and less reliable.
        //
        // ASSEMBLED, NOT WRITTEN AS ONE LITERAL. The security suite strips
        // block comments before scanning this tree, and the wildcard written
        // out contains a slash-star: the stripper would take it for the start
        // of a comment and swallow the declarations after it, quietly narrowing
        // a scan that exists to catch what this tree contains.
        const val OPENABLE_TYPE = "*" + "/" + "*"

        /** Read chunk. Bounded so a large file is not staged in one allocation. */
        private const val CHUNK_BYTES = 64 * 1024
    }

    /** How the host activity presents the picker. Returns false if it could not. */
    internal fun interface DocumentLauncher {
        fun launch(intent: Intent): Boolean
    }

    private var channel: MethodChannel? = null
    private var resolver: ContentResolver? = null
    private var launcher: DocumentLauncher? = null

    /** The call awaiting a chosen document. At most one at a time. */
    private var pending: MethodChannel.Result? = null

    /** The bound the pending call asked for. */
    private var pendingMaxBytes: Int = 0

    private var worker: ExecutorService? = null
    private val main = Handler(Looper.getMainLooper())

    fun attach(messenger: BinaryMessenger, resolver: ContentResolver, launcher: DocumentLauncher) {
        detach()
        this.resolver = resolver
        this.launcher = launcher
        this.worker = Executors.newSingleThreadExecutor()
        this.channel = MethodChannel(messenger, CHANNEL).also { it.setMethodCallHandler(this) }
    }

    fun detach() {
        // A pick that was in flight when the engine went away produced no
        // document, so it is answered as a dismissal rather than left to hang.
        // Nothing is reported to the person: they did not choose a file, and
        // nothing went wrong that concerns them.
        pending?.let { result -> runCatching { result.success(null) } }
        pending = null
        channel?.setMethodCallHandler(null)
        channel = null
        resolver = null
        launcher = null
        worker?.shutdown()
        worker = null
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != METHOD_PICK) {
            result.notImplemented()
            return
        }
        if (pending != null) {
            // A picker is already open. Nothing was chosen for this request.
            result.error(CODE_BUSY, null, null)
            return
        }
        // Read as a Number so a bound that arrived as a 64-bit integer is
        // range-checked rather than throwing inside the codec cast.
        val requested = call.argument<Number>(ARG_MAX_BYTES)?.toLong()
        if (requested == null || requested <= 0L || requested >= Int.MAX_VALUE) {
            // The bound is Dart's to state — it mirrors the server's limit and
            // is asserted there. This side refuses to guess one.
            result.error(CODE_INVALID_REQUEST, null, null)
            return
        }
        val maxBytes = requested.toInt()
        val launcher = this.launcher
        if (launcher == null) {
            result.error(CODE_UNAVAILABLE, null, null)
            return
        }

        pending = result
        pendingMaxBytes = maxBytes
        val launched = launcher.launch(openDocumentIntent())
        if (!launched) {
            // No system document provider could be presented on this device.
            pending = null
            result.error(CODE_UNAVAILABLE, null, null)
        }
    }

    /**
     * The intent, written out rather than taken from a contract helper.
     *
     * CATEGORY_OPENABLE is stated explicitly because the port requires it: it
     * restricts the result to documents that can be opened as a stream, which
     * is the only thing this code does with one. The androidx OpenDocument
     * contract does not add it, so using that contract would have quietly
     * dropped a requirement.
     *
     * No FLAG_GRANT_PERSISTABLE_URI_PERMISSION and no ALLOW_MULTIPLE: one
     * document, readable once, for as long as this task lives.
     */
    private fun openDocumentIntent(): Intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = OPENABLE_TYPE
            putExtra(Intent.EXTRA_MIME_TYPES, ACCEPTED_MIME_TYPES)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
        }

    /**
     * The host activity's result callback. [uri] is null when the person
     * dismissed the picker.
     */
    fun onDocumentChosen(uri: Uri?) {
        val result = pending ?: return
        val resolver = this.resolver
        val worker = this.worker
        if (uri == null) {
            pending = null
            result.success(null)
            return
        }
        if (resolver == null || worker == null) {
            pending = null
            result.error(CODE_UNREADABLE, null, null)
            return
        }
        val limit = pendingMaxBytes
        // Reading happens off the platform thread; the answer is posted back on
        // it, because a channel result may only be delivered there.
        worker.execute {
            val mediaType = runCatching { resolver.getType(uri) }.getOrNull()
            val bytes = readBounded(resolver, uri, limit)
            main.post {
                val awaiting = pending
                pending = null
                if (awaiting == null) {
                    return@post
                }
                if (bytes == null) {
                    // Carries the code and nothing else: a platform message
                    // routinely contains the full path, and a path contains a
                    // name.
                    awaiting.error(CODE_UNREADABLE, null, null)
                } else {
                    awaiting.success(
                        mapOf(
                            KEY_BYTES to bytes,
                            KEY_MEDIA_TYPE to (mediaType ?: "application/octet-stream"),
                        ),
                    )
                }
            }
        }
    }

    /**
     * Opens the granted URI, reads it under the bound, and closes it.
     *
     * `use` closes the stream on every exit — value, exception or early return —
     * which is what makes the close deterministic rather than left to a
     * collector. Returns null when the document could not be read at all.
     */
    private fun readBounded(resolver: ContentResolver, uri: Uri, maxBytes: Int): ByteArray? =
        try {
            resolver.openInputStream(uri)?.use { stream -> readAtMost(stream, maxBytes) }
        } catch (error: Exception) {
            // Includes a revoked grant, a provider that died mid-read, and a
            // document whose backing file is gone. None of them produced bytes.
            null
        }

    /**
     * Reads at most [maxBytes] + 1 bytes.
     *
     * THE EXTRA BYTE IS THE POINT. The bound is the server's — Dart supplies it
     * from the constant that mirrors the platform's ingestion policy — and a
     * file at exactly the bound is acceptable. Reading one byte past it is what
     * makes an oversized file arrive with a length GREATER than the bound, so
     * the client refuses it as too large by the rule it already has, instead of
     * uploading a silently truncated statement as though it were whole.
     */
    private fun readAtMost(stream: InputStream, maxBytes: Int): ByteArray {
        val limit = maxBytes + 1
        val collected = ByteArrayOutputStream()
        val chunk = ByteArray(CHUNK_BYTES)
        var total = 0
        while (total < limit) {
            val wanted = minOf(chunk.size, limit - total)
            val read = stream.read(chunk, 0, wanted)
            if (read < 0) {
                break
            }
            collected.write(chunk, 0, read)
            total += read
        }
        return collected.toByteArray()
    }
}
