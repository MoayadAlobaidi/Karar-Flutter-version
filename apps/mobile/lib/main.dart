// The entrypoint. Everything it does is in `app/bootstrap/app_bootstrap.dart`;
// keeping this file to one line of behaviour means the startup sequence is
// testable without invoking `main`. The feature surface is merged in
// `app/composition/feature_surface.dart` — see that file for why the two
// contributing workstreams cannot simply both apply their own overrides.
import 'app/bootstrap/app_bootstrap.dart';
import 'app/composition/feature_surface.dart';

Future<void> main() => bootstrapKararApp(overrides: featureSurfaceOverrides());
