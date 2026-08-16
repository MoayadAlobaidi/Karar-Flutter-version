/**
 * Expected failure shapes of the control-plane use cases (backend.md §9).
 */

export interface InvalidActor {
  readonly kind: 'invalid_actor';
  readonly message: string;
}

export interface NotAuthorized {
  readonly kind: 'not_authorized';
  readonly permission: string;
  readonly reason: string;
  readonly message: string;
}

export interface InvalidOperationInput {
  readonly kind: 'invalid_operation_input';
  readonly message: string;
}

/** The switch changed between read and write — the operator retries against fresh state. */
export interface VersionConflict {
  readonly kind: 'version_conflict';
  readonly message: string;
}

export interface StoreFailure {
  readonly kind: 'store_failure';
  readonly message: string;
}

export type OperateKillSwitchError =
  | InvalidActor
  | InvalidOperationInput
  | NotAuthorized
  | VersionConflict
  | StoreFailure;
