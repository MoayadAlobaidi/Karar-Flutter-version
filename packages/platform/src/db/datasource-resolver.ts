/**
 * DataSourceResolver — the local foundation of connection resolution
 * (database-portability.md §4).
 *
 * Three infrastructure concepts carry multi-database capability, and none is
 * visible to a use case: `DatabaseProfile` (the typed description of one
 * binding), **`DataSourceResolver`** (resolved tenant/deployment context →
 * datasource), and the connection factory. This file implements the resolver
 * seam with the only implementation Phase 3 needs: every tenant resolves to
 * the single local app-role datasource.
 *
 * Multi-datasource routing arrives with dedicated-database deployments —
 * topology rungs L1+ (a tenant with its own database, then its own
 * deployment; tenancy.md §9). When that phase comes, a routing resolver
 * replaces `SingleDatasourceResolver` at the composition root and NOTHING
 * else changes: repositories and use cases never see which database answered.
 *
 * Deliberately NOT here: any cloud provider name, SDK, or discovery logic.
 * This seam is not wired to any cloud; provider differences live in
 * connection profiles and Terraform (database-portability.md §2–3).
 */

import type { TenantId } from '@karar/shared-kernel';

/**
 * What resolution keys on. Only the tenant today; a deployment-profile key
 * joins when dedicated deployments exist. Optional because platform-scoped
 * work (migrations, outbox relay) has no tenant.
 */
export interface DataSourceContext {
  readonly tenantId?: TenantId;
}

/**
 * Maps resolved context to the datasource the caller should use. The
 * datasource type is generic on purpose: composition roots resolve either a
 * `ConnectionProfile` (and build their own adapter/pool) or an already-built
 * handle such as the platform's `PrismaHandle` — both are infrastructure
 * shapes that never cross into application code.
 */
export interface DataSourceResolver<TDataSource> {
  resolve(context: DataSourceContext): TDataSource;
}

/**
 * Phase 3's only implementation: one shared datasource (topology rung L0 —
 * shared database, `tenant_id` + RLS). Isolation at this rung is carried
 * entirely by RLS under `withPrincipalContext`, never by routing.
 */
export class SingleDatasourceResolver<TDataSource> implements DataSourceResolver<TDataSource> {
  constructor(private readonly dataSource: TDataSource) {}

  /**
   * Context is deliberately unread — every context resolves to the one
   * datasource — so the implementation takes no parameter while keeping the
   * interface's full call signature.
   */
  readonly resolve: DataSourceResolver<TDataSource>['resolve'] = () => this.dataSource;
}
