/**
 * Identity minting for this module's rows (data-model.md §2: UUID v7).
 * Randomness and the clock stay in infrastructure behind this port, so the
 * domain and the use cases remain deterministic (architecture test 11).
 */
export interface IdSource {
  nextId(): string;
}
