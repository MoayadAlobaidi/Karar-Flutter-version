/**
 * Identity minting for this module's rows (data-model.md §2: primary keys
 * are UUID v7). Randomness and the clock live behind this port so the
 * application layer stays deterministic (architecture test 11).
 */
export interface IdSource {
  nextId(): string;
}
