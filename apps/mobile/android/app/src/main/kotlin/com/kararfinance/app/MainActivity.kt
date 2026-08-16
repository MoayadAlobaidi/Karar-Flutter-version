// The single Android entry point.
//
// It stays empty on purpose. Platform channels, native SDK initialisation and
// anything else that runs before Dart would be invisible to the Dart test
// suite and to the architecture rules, so nothing is added here without a
// decision that says why it cannot live in Dart.
//
// The package matches the Gradle `namespace` (com.kararfinance.app), which is
// what makes the manifest's relative `.MainActivity` reference resolve.
package com.kararfinance.app

import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity()
