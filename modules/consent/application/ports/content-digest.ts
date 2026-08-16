/**
 * ContentDigest — the sha256 the content path verifies with, declared inward
 * so the use case stays free of node: builtins and stays testable without
 * them. The algorithm is fixed by the schema: `content_hash` is documented and
 * seeded as the sha256 of the canonical document bytes (migration 0064), and a
 * consent grant pins the version that hash belongs to.
 */

export interface ContentDigest {
  /** Lowercase hex sha256 of the UTF-8 bytes of `content`. */
  sha256Hex(content: string): string;
}
