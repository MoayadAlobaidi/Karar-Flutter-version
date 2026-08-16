-- 0044_invitation_redemption_policies
--
-- Narrow redemption privilege for tenant_invitations — the RLS-04 lesson
-- made structural. The legacy's redemption "elevates the whole transaction to
-- administrator authority rather than the three reads that need it"
-- (tenancy.md §7). Karar's redeemer is authenticated but NOT yet a member of
-- the inviting tenant, so the tenant-scoped policies of 0043 correctly show
-- them nothing. Instead of elevating, the redemption transaction binds
-- sha256 of the PRESENTED token into a transaction-local GUC
-- (app.invitation_token_hash — set with set_config(..., is_local => true),
-- parameterized, by the tenancy module's repository), and these policies
-- expose EXACTLY the one row that token identifies:
--
--   * possession of the bearer token is the capability; the policies turn it
--     into visibility of one row — never of the tenant's other invitations,
--     members, profiles, or anything else;
--   * the GUC dies with the transaction (SET LOCAL semantics), so a pooled
--     connection cannot carry it to the next caller;
--   * an unset/empty GUC yields NULL via NULLIF and matches nothing —
--     fail closed;
--   * no role changes, no BYPASSRLS, no broadened grants: the runtime role
--     stays karar_app throughout, and the adversarial suite asserts the
--     transaction's GUCs and role during redemption.
--
-- The redemption flow this enables, in the redeemer's own principal context:
--   txn 1 (app.user_id + app.invitation_token_hash): read the single
--         invitation row; count a failed attempt via the token-scoped UPDATE.
--   txn 2 (app.tenant_id from the INVITATION ROW — a server-side record,
--         never client input — + app.user_id): the three writes redemption
--         needs and nothing else: the one-time UPDATE ... WHERE redeemed_at
--         IS NULL ... RETURNING, the membership INSERT (0042's WITH CHECK
--         binds it to the authenticated redeemer), and the audit append.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP POLICY
-- tenant_invitations_token_select ON public.tenant_invitations; DROP POLICY
-- tenant_invitations_token_update ON public.tenant_invitations; — after
-- which redemption is impossible for non-members (fail closed, not open).

CREATE POLICY tenant_invitations_token_select ON public.tenant_invitations
  FOR SELECT
  USING (token_hash = NULLIF(current_setting('app.invitation_token_hash', true), ''));

CREATE POLICY tenant_invitations_token_update ON public.tenant_invitations
  FOR UPDATE
  USING (token_hash = NULLIF(current_setting('app.invitation_token_hash', true), ''))
  WITH CHECK (token_hash = NULLIF(current_setting('app.invitation_token_hash', true), ''));
