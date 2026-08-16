/**
 * Identity minting for this module's rows (data-model.md §2: UUID v7).
 * Randomness and the clock stay in infrastructure behind this port.
 */
export interface IdSource {
  nextId(): string;
}
