// The entrypoint. Everything it does is in `app/bootstrap/app_bootstrap.dart`;
// keeping this file to one line means the startup sequence is testable without
// invoking `main`.
import 'app/bootstrap/app_bootstrap.dart';

Future<void> main() => bootstrapKararApp();
