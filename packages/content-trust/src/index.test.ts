// THE POLICY IS A SWITCH SOMEBODY WILL EDIT. These are the answers editing it
// must not be able to change.
import { describe, expect, it } from 'vitest';

import {
  CONTENT_TRUST_CLASSES,
  FORBIDDEN_DIRECT_PAIRS,
  SENSITIVE_SINKS,
  mayReachDirectly,
  platformInstruction,
  untrustedContent,
  type ContentTrustClass,
  type SensitiveSink,
} from './index.js';

describe('the sink policy', () => {
  it('answers for every class and every sink', () => {
    // A policy with a hole is a policy that defaults, and a security default
    // is whatever the language happens to return.
    for (const trust of CONTENT_TRUST_CLASSES) {
      for (const sink of SENSITIVE_SINKS) {
        expect(typeof mayReachDirectly(trust, sink), `${trust} -> ${sink}`).toBe('boolean');
      }
    }
    expect(CONTENT_TRUST_CLASSES).toHaveLength(6);
    expect(SENSITIVE_SINKS.length).toBeGreaterThan(10);
  });

  it('refuses every pair that must never be permitted', () => {
    for (const [trust, sink] of FORBIDDEN_DIRECT_PAIRS) {
      expect(mayReachDirectly(trust, sink), `${trust} must not reach ${sink}`).toBe(false);
    }
    // A list that shrank to nothing would pass the loop above in silence.
    expect(FORBIDDEN_DIRECT_PAIRS.length).toBeGreaterThan(25);
  });

  it('lets NO untrusted content reach ANY sensitive sink directly', () => {
    // Stronger than the list, and the reason the list is not the only check:
    // adding a sink must not quietly open one.
    const untrusted: ContentTrustClass[] = ['UNTRUSTED_USER_CONTENT', 'UNTRUSTED_EXTERNAL_CONTENT'];
    for (const trust of untrusted) {
      for (const sink of SENSITIVE_SINKS) {
        expect(mayReachDirectly(trust, sink), `${trust} -> ${sink}`).toBe(false);
      }
    }
  });

  it('gives a secret exactly one destination', () => {
    const reachable = SENSITIVE_SINKS.filter((sink: SensitiveSink) =>
      mayReachDirectly('SECRET_AUTH_MATERIAL', sink),
    );
    expect(reachable).toEqual(['CREDENTIAL_VERIFIER']);
  });

  it('does not let a derived fact become syntax, a command, a path or a destination', () => {
    for (const sink of [
      'SQL_SYNTAX',
      'SHELL_COMMAND',
      'STORAGE_PATH',
      'CODE_OR_TEMPLATE_EVALUATION',
      'INTERPRETED_MARKUP',
      'NETWORK_DESTINATION',
      'AI_PLATFORM_INSTRUCTION',
    ] as const) {
      expect(mayReachDirectly('TRUSTED_STRUCTURED_PLATFORM_FACT', sink), sink).toBe(false);
    }
  });

  it('is the platform instruction, and only it, that may direct behaviour', () => {
    for (const sink of SENSITIVE_SINKS) {
      expect(mayReachDirectly('TRUSTED_PLATFORM_INSTRUCTION', sink), sink).toBe(true);
    }
    // And it cannot be made out of anything that arrived.
    const fromData: string = 'IMPORT_MAPPING_RULE';
    // @ts-expect-error a string read from data is not an instruction origin
    expect(() => platformInstruction(fromData)).toBeDefined();
  });

  it('gives an identifier exactly one destination', () => {
    // Asserted as a TOTAL set rather than as a list of forbidden pairs. The
    // list version named three sinks and missed `POLICY_STATE`, so permitting
    // an identifier to decide capability state passed every test here — the
    // failure mode of enumerating pairs by hand, found by trying it.
    const reachable = SENSITIVE_SINKS.filter((sink: SensitiveSink) =>
      mayReachDirectly('OPAQUE_IDENTIFIER', sink),
    );
    expect(reachable).toEqual(['DIAGNOSTIC_RECORD']);
  });

  it('gives a derived fact exactly the destinations it is allowed', () => {
    // Total for the same reason: a fact may inform a decision and be recorded,
    // but may never become syntax, a command, a path, markup, a destination, a
    // platform instruction or a credential check.
    const reachable = SENSITIVE_SINKS.filter((sink: SensitiveSink) =>
      mayReachDirectly('TRUSTED_STRUCTURED_PLATFORM_FACT', sink),
    );
    expect([...reachable].sort()).toEqual(
      [
        'AI_RETRIEVAL_CORPUS',
        'AI_TOOL_ARGUMENT',
        'AUTHORIZATION_DECISION',
        'DIAGNOSTIC_RECORD',
        'POLICY_STATE',
        'PRINCIPAL_IDENTITY',
      ].sort(),
    );
  });

  it('treats a person typing it and a file carrying it as the same authority', () => {
    // Provenance differs; authority does not. A field is not trustworthy
    // because its owner typed it.
    for (const sink of SENSITIVE_SINKS) {
      expect(mayReachDirectly('UNTRUSTED_USER_CONTENT', sink), sink).toBe(
        mayReachDirectly('UNTRUSTED_EXTERNAL_CONTENT', sink),
      );
    }
    expect(untrustedContent('SUBJECT_TYPED').trust).toBe('UNTRUSTED_USER_CONTENT');
    expect(untrustedContent('SUBJECT_UPLOADED_FILE').trust).toBe('UNTRUSTED_EXTERNAL_CONTENT');
  });
});
