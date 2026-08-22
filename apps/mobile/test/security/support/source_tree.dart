// Shared helpers for the mobile security regression suite.
//
// Several controls in this suite are properties of the SOURCE TREE rather than
// of a running object: "no private key is committed", "the release manifest
// forbids cleartext", "no withheld capability identifier is named". Those are
// read off disk, so the assertions live here rather than being restated in
// each file.
//
// Tests run with apps/mobile as the working directory.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Directories that are build output, dependency caches, or vendored tooling.
/// Nothing in them is authored here, so scanning them would report other
/// people's code as this project's finding.
const List<String> _excludedPathSegments = <String>[
  '/build/',
  '/.dart_tool/',
  '/.gradle/',
  '/.idea/',
  '/Pods/',
  '/.symlinks/',
  '/ephemeral/',
  '/DerivedData/',
  '/gradle/wrapper/',
  '/xcuserdata/',
];

/// Extensions whose contents are not text and cannot be meaningfully scanned.
const List<String> _binaryExtensions = <String>[
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.jar',
  '.zip',
  '.apk',
  '.aab',
  '.so',
  '.dylib',
  '.a',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.car',
  '.bin',
];

/// A file on disk, with its path normalised to forward slashes and made
/// relative to apps/mobile.
final class SourceFile {
  const SourceFile(this.relativePath, this.contents);

  final String relativePath;
  final String contents;

  /// The file's lines, 1-based when reported.
  List<String> get lines => contents.split('\n');
}

/// Asserts the suite is running from apps/mobile, then returns that directory.
Directory mobilePackageRoot() {
  final directory = Directory.current;
  expect(
    File('${directory.path}/pubspec.yaml').existsSync(),
    isTrue,
    reason: 'the mobile security suite must run with apps/mobile as the working directory',
  );
  return directory;
}

bool _isExcluded(String normalisedPath) {
  final padded = '/$normalisedPath';
  for (final segment in _excludedPathSegments) {
    if (padded.contains(segment)) {
      return true;
    }
  }
  for (final extension in _binaryExtensions) {
    if (normalisedPath.toLowerCase().endsWith(extension)) {
      return true;
    }
  }
  return false;
}

/// Every readable text file under [relativeRoots], relative to apps/mobile.
///
/// A root that does not exist is skipped rather than failing: the iOS tree is
/// absent on some checkouts, and a missing directory is not a security finding.
List<SourceFile> readSourceFiles(List<String> relativeRoots) {
  final root = mobilePackageRoot();
  final files = <SourceFile>[];
  for (final relativeRoot in relativeRoots) {
    final directory = Directory('${root.path}/$relativeRoot');
    if (!directory.existsSync()) {
      continue;
    }
    for (final entity in directory.listSync(recursive: true)) {
      if (entity is! File) {
        continue;
      }
      final relativePath =
          entity.path.substring(root.path.length + 1).replaceAll(r'\', '/');
      if (_isExcluded(relativePath)) {
        continue;
      }
      final String contents;
      try {
        contents = entity.readAsStringSync();
      } on FileSystemException {
        // Unreadable or not valid UTF-8. Binary content is excluded above; a
        // file that still fails to decode is not text and holds no literal.
        continue;
      }
      files.add(SourceFile(relativePath, contents));
    }
  }
  expect(
    files,
    isNotEmpty,
    reason: 'expected to scan at least one file under $relativeRoots',
  );
  return files;
}

/// The source roots this suite treats as "the mobile client".
///
/// `test/` is included deliberately: a credential pasted into a fixture is
/// committed just as permanently as one pasted into `lib/`.
const List<String> mobileSourceRoots = <String>[
  'lib',
  'android',
  'ios',
  'tool',
  'test',
];

/// Reads one file relative to apps/mobile, failing the test if it is absent.
String readRequiredFile(String relativePath) {
  final file = File('${mobilePackageRoot().path}/$relativePath');
  expect(
    file.existsSync(),
    isTrue,
    reason: '$relativePath must exist: a control that is asserted here cannot be optional',
  );
  return file.readAsStringSync();
}

/// Collapses XML/plist whitespace so assertions can be written against the
/// meaningful text rather than against an indentation style.
///
/// Named for XML rather than the obvious `collapseWhitespace`, which collides
/// with a matcher of that name exported by `package:matcher`.
String collapseXmlWhitespace(String value) =>
    value.replaceAll(RegExp(r'\s+'), ' ').trim();

/// Whether a path is source code whose `//` and `/* */` comments should be
/// stripped before a content assertion runs.
bool isCodeLikePath(String relativePath) =>
    RegExp(r'\.(dart|kt|kts|gradle|swift|java|properties|yaml|yml)$')
        .hasMatch(relativePath);

/// Removes XML comments, so an assertion about what a manifest DECLARES is not
/// satisfied (or broken) by prose that merely mentions it.
String stripXmlComments(String value) =>
    value.replaceAll(RegExp(r'<!--.*?-->', dotAll: true), '');

/// What an XML or plist file at [relativePath] DECLARES: its contents with
/// comments removed and whitespace collapsed.
///
/// The explanatory prose in the manifests and plists this suite reads names the
/// very attributes under test, so a comment must not be able to satisfy — or
/// break — an assertion. Collapsing whitespace lets assertions be written
/// against the meaningful text rather than against an indentation style.
String declarations(String relativePath) =>
    collapseXmlWhitespace(stripXmlComments(readRequiredFile(relativePath)));

/// Removes `//` and `/* */` comments from a Dart, Kotlin or Gradle source
/// file. The security suite asserts against CODE; the explanatory comments in
/// these files legitimately name the very things being searched for.
///
/// A `//` preceded by `:` is left alone. Otherwise a database URL carrying an
/// inline password would be truncated at its scheme, turning the single most
/// important pattern in the secret scan into a silent false negative.
///
/// This doc comment deliberately DESCRIBES that URL shape rather than showing
/// one: the shell-based mobile secret scan in security.yml does not strip
/// comments, so an example here would be reported as a finding by the very
/// rule it explains.
String stripCodeComments(String value) => value
    .replaceAll(RegExp(r'/\*.*?\*/', dotAll: true), '')
    .split('\n')
    .map((String line) {
      final match = RegExp(r'(?<!:)//').firstMatch(line);
      return match == null ? line : line.substring(0, match.start);
    })
    .join('\n');
