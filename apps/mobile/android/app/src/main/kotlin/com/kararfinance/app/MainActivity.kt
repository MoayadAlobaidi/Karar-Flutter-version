// The single Android entry point.
//
// It carries no logic on purpose. Platform channels, native SDK initialisation
// and anything else that runs before Dart would be invisible to the Dart test
// suite and to the architecture rules, so nothing is added here without a
// decision that says why it cannot live in Dart.
//
// THE BASE CLASS IS A REQUIREMENT, NOT A PREFERENCE. androidx.biometric shows
// its prompt as a fragment, so the application lock's authenticator needs a
// FragmentActivity to host it. With the plain FlutterActivity the plugin
// answers every prompt with "the current Activity must be a FragmentActivity"
// and the lock can never open. FlutterFragmentActivity is the Flutter-supplied
// FragmentActivity host and behaves identically in every other respect; it is
// referenced from the manifest as `.MainActivity` exactly as before.
//
// The package matches the Gradle `namespace` (com.kararfinance.app), which is
// what makes the manifest's relative `.MainActivity` reference resolve.
package com.kararfinance.app

import io.flutter.embedding.android.FlutterFragmentActivity

class MainActivity : FlutterFragmentActivity()
