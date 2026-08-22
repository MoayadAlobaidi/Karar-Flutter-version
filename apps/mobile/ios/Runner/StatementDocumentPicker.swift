// THE iOS HALF OF THE DOCUMENT PICKER, AND THE ENTITLEMENT ARGUMENT FOR IT.
//
// This asks the system for ONE DOCUMENT. It does not ask for a folder, for the
// photo library, or for anything the person did not point at.
//
// NO ENTITLEMENT IS ADDED, AND NONE IS REQUIRED. UIDocumentPickerViewController
// hands back a security-scoped URL for the single file the person selected;
// that grant comes from the selection itself, not from a capability the
// application declares. The read-only user-selected-files entitlement people
// reach for here belongs to the macOS App Sandbox and has no iOS counterpart,
// and no Info.plist usage-description key applies either — the picker is not a
// protected data class. This project's Runner target therefore still has no
// entitlements file at all, which is the state a reviewer should find.
//
// WHAT THIS FILE DELIBERATELY NEVER DOES:
//
//   * it never opens a directory. The folder-picking initialiser would return a
//     scope covering files nobody chose;
//   * it takes NO bookmark. `bookmarkData` is not called, so nothing here can
//     re-open the file after this import — the access ends with the read;
//   * it uses OPEN mode, not import-copy (`asCopy: false`). The copy mode
//     writes a duplicate of a person's bank statement into this application's
//     container, and a statement this product left on the device is exactly
//     what the import flow is written not to do;
//   * it balances the security scope exactly. Every successful
//     startAccessingSecurityScopedResource has one matching stop on every exit
//     path, by `defer`;
//   * it returns NO filename and NO path. The Dart port has no field for
//     either. The same rule governs failures: an error carries a code and
//     nothing else, because a platform message routinely contains the path.
//
// DEVICE EXECUTION IS NOT VERIFIED. Nothing in this repository has run this
// code on a device or a simulator. It compiles, its channel contract is
// asserted from Dart against the framework's mock messenger, and its names are
// asserted against the Dart constants by a source-level test. Behaviour against
// a real document provider is unverified and must not be described otherwise.
import Flutter
import UIKit
import UniformTypeIdentifiers

final class StatementDocumentPicker: NSObject {

  /// Must match `documentPickerChannelName` in
  /// lib/features/statement_imports/data/platform_statement_source_picker.dart.
  /// A fixed literal, deliberately not derived from the bundle identifier,
  /// which carries a per-environment suffix.
  static let channelName = "com.kararfinance.app/document_picker"

  /// The one method this channel answers.
  static let methodPick = "pickCsvSource"

  /// The byte bound, supplied by Dart. See `readAtMost`.
  static let argumentMaxBytes = "maxBytes"

  static let keyBytes = "bytes"
  static let keyMediaType = "mediaType"

  static let codeUnavailable = "PICKER_UNAVAILABLE"
  static let codeUnreadable = "SOURCE_UNREADABLE"
  static let codeBusy = "PICKER_BUSY"
  static let codeInvalidRequest = "INVALID_REQUEST"

  /// What a document of unknown declared type is called.
  private static let unknownMediaType = "application/octet-stream"

  /// The types offered to the document provider.
  ///
  /// CONVENIENCE, NOT A CONTROL. A provider may ignore the filter, a file may
  /// be mislabelled, and a person may rename a spreadsheet. The platform
  /// decides what the content actually is by inspecting it and refuses
  /// archives, spreadsheets and binaries on that basis; nothing downstream
  /// trusts a document because the picker offered it.
  ///
  /// `plainText` is the safe fallback: CSV exports are routinely typed as plain
  /// text, and a filter that hid a person's real statement would be a worse
  /// failure than showing one file too many.
  private static let acceptedContentTypes: [UTType] = [.commaSeparatedText, .plainText]

  /// Reads happen here so the interface thread is not held while a file is
  /// pulled out of a provider that may be a network one.
  private let readQueue = DispatchQueue(label: "com.kararfinance.app.document-read")

  private var channel: FlutterMethodChannel?

  /// The call awaiting a chosen document. At most one at a time.
  private var pending: FlutterResult?

  /// The bound the pending call asked for.
  private var pendingMaxBytes = 0

  func register(with messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(name: Self.channelName, binaryMessenger: messenger)
    channel.setMethodCallHandler { [weak self] call, result in
      self?.handle(call, result: result)
    }
    self.channel = channel
  }

  private func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == Self.methodPick else {
      result(FlutterMethodNotImplemented)
      return
    }
    if pending != nil {
      // A picker is already open. Nothing was chosen for this request.
      result(FlutterError(code: Self.codeBusy, message: nil, details: nil))
      return
    }
    // The bound is Dart's to state — it mirrors the server's ingestion limit
    // and is asserted there. This side refuses to guess one.
    guard
      let arguments = call.arguments as? [String: Any],
      let requested = arguments[Self.argumentMaxBytes] as? Int,
      requested > 0
    else {
      result(FlutterError(code: Self.codeInvalidRequest, message: nil, details: nil))
      return
    }
    guard let host = Self.topViewController() else {
      // Nothing on screen to present from. A fact about this moment, not a
      // failure of the person's, and no retry of ours can fix it.
      result(FlutterError(code: Self.codeUnavailable, message: nil, details: nil))
      return
    }

    pending = result
    pendingMaxBytes = requested

    // OPEN, NOT IMPORT-COPY: `asCopy: false`. See the file header.
    let picker = UIDocumentPickerViewController(
      forOpeningContentTypes: Self.acceptedContentTypes,
      asCopy: false
    )
    picker.allowsMultipleSelection = false
    picker.delegate = self
    host.present(picker, animated: true)
  }

  /// Answers the pending call, if there still is one, on the platform thread.
  private func answer(_ reply: @escaping (FlutterResult) -> Void) {
    guard let awaiting = pending else { return }
    pending = nil
    reply(awaiting)
  }

  private func finish(with url: URL) {
    let limit = pendingMaxBytes
    readQueue.async { [weak self] in
      let read = Self.readBounded(url: url, maxBytes: limit)
      DispatchQueue.main.async {
        guard let self = self else { return }
        self.answer { reply in
          guard let read = read else {
            // Carries the code and nothing else: a platform message routinely
            // contains the full path, and a path contains a name.
            reply(FlutterError(code: Self.codeUnreadable, message: nil, details: nil))
            return
          }
          reply([
            Self.keyBytes: FlutterStandardTypedData(bytes: read.bytes),
            Self.keyMediaType: read.mediaType,
          ])
        }
      }
    }
  }

  /// Opens the security-scoped URL, reads it under the bound, and releases the
  /// scope. Returns nil when the document could not be read at all.
  private static func readBounded(url: URL, maxBytes: Int) -> (bytes: Data, mediaType: String)? {
    // BALANCED EXACTLY. `startAccessingSecurityScopedResource` may legitimately
    // answer false — a URL this process already has access to does not need the
    // scope — and calling `stop` for a scope that was never started is the bug
    // this flag exists to prevent.
    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped {
        url.stopAccessingSecurityScopedResource()
      }
    }

    var coordinationError: NSError?
    var outcome: (bytes: Data, mediaType: String)?
    // Coordinated because an open-in-place URL may be owned by another process,
    // and reading it without coordination can observe a half-written file.
    NSFileCoordinator().coordinate(
      readingItemAt: url,
      options: [],
      error: &coordinationError
    ) { readable in
      guard let bytes = readAtMost(readable, maxBytes: maxBytes) else { return }
      outcome = (bytes: bytes, mediaType: declaredMediaType(of: readable))
    }
    if coordinationError != nil {
      return nil
    }
    return outcome
  }

  /// Reads at most `maxBytes` + 1 bytes.
  ///
  /// THE EXTRA BYTE IS THE POINT. The bound is the server's — Dart supplies it
  /// from the constant that mirrors the platform's ingestion policy — and a
  /// file at exactly the bound is acceptable. Reading one byte past it is what
  /// makes an oversized file arrive with a length GREATER than the bound, so
  /// the client refuses it as too large by the rule it already has, instead of
  /// uploading a silently truncated statement as though it were whole.
  ///
  /// The handle is closed on every exit path, by `defer`, rather than left to
  /// a deallocation this code does not control.
  private static func readAtMost(_ url: URL, maxBytes: Int) -> Data? {
    guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
    defer { try? handle.close() }
    guard let bytes = try? handle.read(upToCount: maxBytes + 1) else { return nil }
    return bytes
  }

  /// What the provider says the file is. Advisory only, never rendered.
  private static func declaredMediaType(of url: URL) -> String {
    guard
      let values = try? url.resourceValues(forKeys: [.contentTypeKey]),
      let type = values.contentType,
      let mime = type.preferredMIMEType
    else {
      return unknownMediaType
    }
    return mime
  }

  /// The view controller a modal can be presented from.
  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
      ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    guard var top = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
      return nil
    }
    while let presented = top.presentedViewController {
      top = presented
    }
    return top
  }
}

extension StatementDocumentPicker: UIDocumentPickerDelegate {

  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    // Single selection is set on the controller, so anything past the first is
    // not something this build asked for and is not read.
    guard let url = urls.first else {
      answer { reply in reply(nil) }
      return
    }
    finish(with: url)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    // A person changing their mind is not an error, and is never reported as
    // one.
    answer { reply in reply(nil) }
  }
}
