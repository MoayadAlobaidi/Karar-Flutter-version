/**
 * The control-plane module's only legal import surface (architecture test 3).
 * Phase 3 exports the kill-switch slice: the closed registry and evaluation
 * rule, the KillSwitchPort identity/tenancy flows consume (with its
 * CheckKillSwitch implementation), the OperateKillSwitch use case, the
 * operation guard, and the infrastructure the composition root wires. The
 * Phase 8 gateway (admin identities, scoped tokens) is deliberately absent.
 */

// domain — the registry and the restrict-only evaluation
export {
  KILL_SWITCH_IDS,
  KILL_SWITCH_STATES,
  evaluateKillSwitch,
  isKillSwitchId,
  type KillSwitch,
  type KillSwitchEvaluation,
  type KillSwitchId,
  type KillSwitchState,
} from './domain/kill-switch.js';

// application — the provided port, use cases, required ports, errors
export type { KillSwitchPort, OperationDenied } from './application/kill-switch-port.js';
export { CheckKillSwitch } from './application/use-cases/check-kill-switch.js';
export {
  OperateKillSwitch,
  type KillSwitchOperated,
  type OperateKillSwitchInput,
} from './application/use-cases/operate-kill-switch.js';
export {
  KillSwitchConflictError,
  KillSwitchRegistryError,
  type KillSwitchOperation,
  type KillSwitchStore,
} from './application/ports/kill-switch-store.js';
export {
  CONTROL_PLANE_PERMISSIONS,
  type PolicyActor,
  type PolicyDecision,
  type PolicyService,
} from './application/ports/policy-service.js';
export type {
  AuditTrail,
  AuditTrailEntry,
  AuditTrailFailure,
} from './application/ports/audit-trail.js';
export type {
  InvalidActor,
  InvalidOperationInput,
  NotAuthorized,
  OperateKillSwitchError,
  StoreFailure,
  VersionConflict,
} from './application/errors.js';

// infrastructure — implementations for the composition root
export {
  ControlPlaneStoreError,
  PrismaKillSwitchStore,
} from './infrastructure/persistence/prisma-kill-switch-store.js';
export { RecordAuditEventAuditTrail } from './infrastructure/audit/record-audit-event-audit-trail.js';

// presentation — the operation guard and its wiring
export {
  KILL_SWITCH_PORT,
  KillSwitchGuard,
  RequireOperationAllowed,
} from './presentation/http/kill-switch.guard.js';
export {
  ControlPlaneModule,
  type ControlPlaneModuleOptions,
} from './presentation/control-plane.module.js';
