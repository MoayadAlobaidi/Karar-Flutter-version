/**
 * The ContentDigest implementation: sha256 over the UTF-8 bytes, which is what
 * migration 0064 documents `content_hash` to be and what the local seed
 * computes when it publishes its synthetic version. node:crypto lives here, in
 * infrastructure, and never in the use case.
 */

import { createHash } from 'node:crypto';

import type { ContentDigest } from '../../application/ports/content-digest.js';

export class Sha256ContentDigest implements ContentDigest {
  sha256Hex(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }
}
