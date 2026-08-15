import 'package:flutter/material.dart';

void main() {
  runApp(const KararApp());
}

/// Phase 1 shell: boots, renders a placeholder, and nothing else.
/// No product features, no financial math on the client (ADR-0007).
class KararApp extends StatelessWidget {
  const KararApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Karar',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F3D3E)),
      ),
      home: const Scaffold(
        body: Center(
          child: Text('Karar — Phase 1 shell'),
        ),
      ),
    );
  }
}
