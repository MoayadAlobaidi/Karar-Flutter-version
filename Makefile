SHELL := /bin/bash
.DEFAULT_GOAL := help

# The Makefile is the local development entrypoint, so local is the default
# environment here — and only here. The credential-fallback gate in
# packages/platform treats an UNSET KARAR_ENV as non-local on purpose (a
# mis-targeted CLI run must not downgrade role passwords); direct CLI use and
# CI set the variable explicitly.
export KARAR_ENV ?= local

.PHONY: prisma-generate prisma-drift help doctor bootstrap dev down reset-local generate lint test test-golden architecture-test security-scan docs-check verify db-create db-migrate db-verify db-reset-local

help: ## List available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

doctor: ## Check local toolchain against .tool-versions
	node scripts/dev/doctor.mjs

bootstrap: ## Install workspace and Flutter dependencies
	pnpm install
	cd apps/mobile && flutter pub get

dev: ## Start local infrastructure, then print how to run the entrypoints
	docker compose up -d --wait
	@echo ""
	@echo "Infrastructure is up (postgres :5432, redis :6379, minio :9000/:9001, otel :4317/:4318)."
	@echo "Next:"
	@echo "  pnpm --filter @karar/api dev       # HTTP entrypoint on :3000"
	@echo "  pnpm --filter @karar/worker dev    # background entrypoint"
	@echo "  pnpm --filter @karar/admin dev     # admin SPA on :5173"
	@echo "  cd apps/mobile && flutter run      # mobile client"

down: ## Stop local infrastructure
	docker compose down

reset-local: ## Stop local infrastructure and DELETE local data volumes
	@echo "Removing containers and named volumes — local Postgres and MinIO data will be deleted."
	docker compose down -v

generate: ## Code generation (none in Phase 1)
	@echo "no generators yet (SDK generation arrives with the API contract)"

lint: ## ESLint and Prettier check
	pnpm lint
	pnpm format:check

test: ## Vitest workspace suites and Flutter tests (golden baselines excluded, as in CI)
	pnpm test
	# --exclude-tags golden matches what CI runs. Without it, `make test` and CI
	# disagree about which tests exist: the golden baselines were rasterised on
	# one machine and the default comparator is zero-tolerance, so they pass or
	# fail on where they run rather than on whether anything regressed. Run them
	# deliberately with `make test-golden`.
	cd apps/mobile && flutter test --exclude-tags golden

test-golden: ## Golden baselines only (see docs/architecture/flutter.md on their platform limits)
	cd apps/mobile && flutter test --tags golden

architecture-test: ## Architecture rules (scripts/checks/architecture.mjs)
	pnpm arch:test

docs-check: ## Documentation consistency (scripts/checks/docs-check.mjs)
	pnpm docs:check

security-scan: ## Dependency audit locally; full scans run in CI
	pnpm audit --audit-level high
	@if command -v gitleaks >/dev/null 2>&1; then \
		gitleaks detect --source . ; \
	else \
		echo "gitleaks not installed locally — secret scan (gitleaks) runs in CI alongside pnpm audit"; \
	fi

# architecture-test and docs-check run scripts/checks/architecture.mjs and
# docs-check.mjs; both are part of the required CI gate.
verify: ## Full local gate, fail fast
	pnpm format:check
	pnpm lint
	pnpm typecheck
	pnpm build
	$(MAKE) test
	$(MAKE) architecture-test
	$(MAKE) docs-check

db-create: ## Bootstrap roles and create the local database (superuser, local only)
	pnpm --filter @karar/platform build >/dev/null
	pnpm --filter @karar/platform db:create

db-migrate: ## Apply pending migrations as the restricted migrator role
	pnpm --filter @karar/platform build >/dev/null
	pnpm --filter @karar/platform db:migrate

db-verify: ## Report applied/pending/drift; --strict fails on pending
	pnpm --filter @karar/platform build >/dev/null
	pnpm --filter @karar/platform db:verify

db-reset-local: ## Drop and recreate the LOCAL database (guarded: KARAR_ENV=local)
	pnpm --filter @karar/platform build >/dev/null
	pnpm --filter @karar/platform db:reset-local

prisma-generate: ## Regenerate the Prisma client from the schema folder
	pnpm --filter @karar/platform exec prisma generate --schema prisma/schema

prisma-drift: ## Fail if any mapped Prisma model diverges from the live database
	node scripts/db/prisma-mapping-check.mjs
