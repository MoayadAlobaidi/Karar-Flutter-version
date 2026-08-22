// The single Android entry point.
//
// It carries almost no logic on purpose. Platform channels, native SDK
// initialisation and anything else that runs before Dart would be invisible to
// the Dart test suite and to the architecture rules, so nothing is added here
// without a decision that says why it cannot live in Dart.
//
// THE BASE CLASS IS A REQUIREMENT, NOT A PREFERENCE. androidx.biometric shows
// its prompt as a fragment, so the application lock's authenticator needs a
// FragmentActivity to host it. With the plain FlutterActivity the plugin
// answers every prompt with "the current Activity must be a FragmentActivity"
// and the lock can never open. FlutterFragmentActivity is the Flutter-supplied
// FragmentActivity host and behaves identically in every other respect; it is
// referenced from the manifest as `.MainActivity` exactly as before.
//
// THE ONE PIECE OF LOGIC, AND WHY IT CANNOT LIVE IN DART. The statement-import
// document picker is an Activity result: only an Activity can start
// ACTION_OPEN_DOCUMENT and only an Activity receives what the person chose. The
// work itself is in StatementDocumentPicker.kt; this file supplies the launcher
// and forwards the chosen URI, and does nothing else with it. Reading it here
// rather than through a file-picker dependency is what keeps the merged
// manifest's permission set unchanged — the system document picker needs none.
//
// DEVICE EXECUTION IS NOT VERIFIED for that path. See StatementDocumentPicker.kt.
//
// The package matches the Gradle `namespace` (com.kararfinance.app), which is
// what makes the manifest's relative `.MainActivity` reference resolve.
package com.kararfinance.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterFragmentActivity() {

    private val documentPicker = StatementDocumentPicker()

    /**
     * Registered in [onCreate], which is the only point at which the result
     * registry accepts one: a launcher registered later would throw when the
     * activity is already started.
     */
    private lateinit var chooseDocument: ActivityResultLauncher<Intent>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        chooseDocument =
            registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
                // A dismissed picker arrives as anything other than RESULT_OK,
                // and is reported as a dismissal rather than as a failure.
                val chosen =
                    if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
                documentPicker.onDocumentChosen(chosen)
            }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        documentPicker.attach(
            flutterEngine.dartExecutor.binaryMessenger,
            contentResolver,
        ) { intent ->
            try {
                chooseDocument.launch(intent)
                true
            } catch (error: ActivityNotFoundException) {
                // No document provider on this device could serve the request.
                // Answered as "unavailable" rather than as a failure, because
                // it is a fact about the device and no retry can succeed.
                false
            }
        }
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        documentPicker.detach()
        super.cleanUpFlutterEngine(flutterEngine)
    }
}
