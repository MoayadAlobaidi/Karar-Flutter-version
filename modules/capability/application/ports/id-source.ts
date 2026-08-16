/** Identifier minting port; infrastructure supplies UUIDv7. */
export interface IdSource {
  nextId(): string;
}
