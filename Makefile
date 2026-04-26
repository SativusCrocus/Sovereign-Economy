# Makefile — top-level verb table for the Sovereign Economy repo.
#
# Most subprojects (contracts/, services/*) have their own package
# managers; this file is the cross-project glue: "what command do I run
# to X?" Verbs delegate to scripts under scripts/ or to the underlying
# tool. Run `make help` for the list.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# Repo root, regardless of where you invoke make from.
ROOT := $(shell git rev-parse --show-toplevel 2>/dev/null || pwd)

# ----------------------------------------------------------------------------
# Help (default target)
# ----------------------------------------------------------------------------
.PHONY: help
help:  ## Show this help.
	@printf '\033[1mSovereign Economy — make verbs\033[0m\n\n'
	@awk 'BEGIN{FS=":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf '\nExamples:\n'
	@printf '  make verify           # run scoped checks against staged changes\n'
	@printf '  make preflight        # validate deploy readiness (default staging)\n'
	@printf '  make deploy-staging   # build HEAD, up staging, smoke\n'
	@printf '  make promote-prod     # promote .staging-last-good to prod\n'
	@printf '  make rollback         # roll prod back to .prod-prev\n'

# ----------------------------------------------------------------------------
# Verification — same checks as the Claude pre-commit hook
# ----------------------------------------------------------------------------
.PHONY: verify verify-commit verify-push
verify: verify-commit  ## Run scoped pre-commit verification (same checks as the Claude hook).

verify-commit:  ## Run verification as if a `git commit` were happening.
	@echo '{"tool_input":{"command":"git commit -m make-verify"}}' | bash "$(ROOT)"/.claude/scripts/verify.sh

verify-push:  ## Run verification as if a `git push` were happening.
	@echo '{"tool_input":{"command":"git push"}}' | bash "$(ROOT)"/.claude/scripts/verify.sh

# ----------------------------------------------------------------------------
# Docs
# ----------------------------------------------------------------------------
.PHONY: docs-sync docs-check
docs-sync:  ## Copy canonical docs/ into frontend/docs/.
	@bash "$(ROOT)"/scripts/docs-sync.sh

docs-check:  ## Exit 1 if docs/ and frontend/docs/ have drifted.
	@bash "$(ROOT)"/scripts/docs-sync.sh --check

# ----------------------------------------------------------------------------
# Contracts
# ----------------------------------------------------------------------------
.PHONY: contracts-test contracts-invariants contracts-slither contracts-solhint contracts-abi
contracts-test:  ## Run the Hardhat test suite.
	@cd "$(ROOT)"/contracts && npx hardhat test

contracts-invariants:  ## Run the Foundry invariant suite.
	@cd "$(ROOT)"/contracts && forge test --match-path "test-forge/**"

contracts-slither:  ## Run slither static analysis (zero findings expected).
	@cd "$(ROOT)"/contracts && slither .

contracts-solhint:  ## Run solhint with --max-warnings 0.
	@cd "$(ROOT)"/contracts && npx solhint --max-warnings 0 "src/**/*.sol"

contracts-abi:  ## Recompile contracts and sync ABI JSON to frontend/lib/abi.
	@cd "$(ROOT)"/contracts && npx hardhat compile && npx ts-node scripts/extract-abi.ts
	@bash "$(ROOT)"/scripts/sync-abi.sh

# ----------------------------------------------------------------------------
# IPFS / secrets bring-up helpers
# ----------------------------------------------------------------------------
.PHONY: ipfs-key ipfs-pass
ipfs-key:  ## Generate the libp2p private-swarm pre-shared key (one-time per peer set).
	@bash "$(ROOT)"/deploy/ipfs/generate-swarm-key.sh

ipfs-pass:  ## Hash the IPFS HTTP-gateway password and write it into deploy/.env.
	@bash "$(ROOT)"/scripts/generate-ipfs-pass.sh

# ----------------------------------------------------------------------------
# Deploy lifecycle
# ----------------------------------------------------------------------------
# Two env files drive two environments off the same compose overlays:
#   deploy/.env.staging  → staging  (rehearsal, testnet RPCs)
#   deploy/.env          → prod     (mainnet-eligible)
# See docs/runbook.md for the full lifecycle.
ENV_STAGING := $(ROOT)/deploy/.env.staging
ENV_PROD    := $(ROOT)/deploy/.env

# Override on the command line: `make logs ENV_FILE=deploy/.env`.
ENV_FILE ?= $(ENV_STAGING)

# Compose merge used by every lifecycle verb below.
COMPOSE_FILES := -f $(ROOT)/deploy/docker-compose.yaml \
                 -f $(ROOT)/deploy/docker-compose.prod.yaml \
                 -f $(ROOT)/deploy/docker-compose.tagged.yaml

.PHONY: preflight smoke deploy-staging promote-prod rollback staging-up staging-down logs
preflight:  ## Validate deploy readiness (env, DNS, swarm.key, compose merge).
	@ENV_FILE="$(ENV_FILE)" bash "$(ROOT)"/scripts/preflight.sh

smoke:  ## Post-deploy smoke tests (Caddy, mcp-gateway, IPFS, VRF).
	@ENV_FILE="$(ENV_FILE)" bash "$(ROOT)"/scripts/post-deploy-smoke.sh

deploy-staging:  ## Build HEAD (or SHA=…) and bring up staging; record .staging-last-good on green smoke.
	@bash "$(ROOT)"/deploy/deploy-staging.sh $(SHA)

promote-prod:  ## Promote .staging-last-good (or SHA=…) to prod after gates pass.
	@bash "$(ROOT)"/deploy/promote-to-prod.sh $(SHA)

rollback:  ## Roll prod back to .prod-prev (or SHA=…); requires images present locally.
	@bash "$(ROOT)"/deploy/rollback.sh $(SHA)

staging-up:  ## Manual: bring up staging without running deploy-staging.sh.
	@DAES_TAG=$$(git -C "$(ROOT)" rev-parse --short=12 HEAD) \
	  docker compose $(COMPOSE_FILES) --env-file "$(ENV_STAGING)" up -d --build

staging-down:  ## Tear down the staging stack (keeps volumes).
	@DAES_TAG=$$(git -C "$(ROOT)" rev-parse --short=12 HEAD) \
	  docker compose $(COMPOSE_FILES) --env-file "$(ENV_STAGING)" down

logs:  ## Tail logs across the active stack (default staging; ENV_FILE=deploy/.env for prod).
	@DAES_TAG=$$(git -C "$(ROOT)" rev-parse --short=12 HEAD) \
	  docker compose $(COMPOSE_FILES) --env-file "$(ENV_FILE)" logs -f --tail=200
