import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {

  /// The statement-import document picker.
  ///
  /// Held here because it is the delegate of a modally presented controller and
  /// must outlive the call that raised it. It adds no entitlement and no
  /// Info.plist key; see Runner/StatementDocumentPicker.swift for why none is
  /// required. DEVICE EXECUTION IS NOT VERIFIED — likewise stated there.
  private let documentPicker = StatementDocumentPicker()

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    documentPicker.register(with: engineBridge.applicationRegistrar.messenger())
  }
}
