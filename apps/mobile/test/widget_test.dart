import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/main.dart';

void main() {
  testWidgets('renders the Phase 1 shell', (WidgetTester tester) async {
    await tester.pumpWidget(const KararApp());
    expect(find.text('Karar — Phase 1 shell'), findsOneWidget);
  });
}
