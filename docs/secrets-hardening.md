# Secrets Hardening — Migration Plan

The dev deployment stores all secrets in `deploy/.env`. That file is gitignored and fine for local work, but every mainnet deployment must move secrets off disk. This document enumerates every secret, categorises it, and lists a concrete migration target for each.

## Secret inventory

| Variable | Category | Current location | Recommended target | Rotation cadence |
|---|---|---|---|---|
| `MCP_JWT_SECRET` | HMAC key | `.env` | Secrets manager (Vault / Doppler / AWS SM) | 30 days |
| `MCP_JWT` | Signed JWT | `.env` | Re-mint from `MCP_JWT_SECRET` at session start | 1 hour |
| `WEAVIATE_API_KEY` | API key | `.env` | Secrets manager | 90 days |
| `GRAFANA_ADMIN_PASSWORD` | Password | `.env` | Secrets manager | 90 days |
| `AGENT_KEY_DEFAULT`, `AGENT_KEY_<ARCHETYPE>` | Ethereum signing key | `.env` | **HSM** (AWS KMS, YubiHSM, GCP HSM) | Never (rotate key ID, not material) |
| `DEPLOYER_PRIVATE_KEY` | Ethereum signing key | `.env` | **Hardware wallet** (Ledger / Trezor) or HSM | Never for mainnet |
| `DAES_SIGNER_<N>` | Governor-signer address (pubkey) | `.env` | Public — fine in `.env` | N/A |
| `BASE_RPC_URL`, `OP_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `OP_SEPOLIA_RPC_URL` | URL with embedded token | `.env` | Secrets manager | 180 days |
| `AISSTREAM_API_KEY`, `DHL_API_KEY`, `MAERSK_API_KEY` | Third-party API keys | `.env` | Secrets manager | 90 days |
| `WEB3_STORAGE_TOKEN` | API key | `.env` | Secrets manager | 90 days |
| `TENDERLY_URL`, `TENDERLY_ACCESS_KEY`, `PIMLICO_API_KEY` | API key | `.env` | Secrets manager | 90 days |
| `DAES_ACME_EMAIL`, `DAES_PUBLIC_DOMAIN`, `DAES_CONSOLE_DOMAIN` | Config, non-secret | `.env` | `.env` is fine | N/A |
| `DAES_SEED` | Swarm seed (pre-VRF migration) | `.env` | Becomes on-chain Chainlink VRF subscription after #13 | Per-draw |

## Rule of three

1. **Signing keys never leave the HSM.** `AGENT_KEY_*` and `DEPLOYER_PRIVATE_KEY` must move to an HSM before any mainnet transaction. `services/mcp-gateway/app/handlers/wallet_sign.py::_resolve_key` today returns a hex string directly to `Account.from_key(priv)`; that function must be replaced with a remote-signing call. Known-good patterns:
   - **AWS KMS** — [`aws-kms-ethereum-signatures`](https://github.com/lucashenning/aws-kms-ethereum-signing) or hand-rolled with `boto3` + `eth_account._utils.signing`. Keys created with `KeyUsage=SIGN_VERIFY` and `KeySpec=ECC_SECG_P256K1` never export raw material.
   - **YubiHSM 2** — `yubihsm-secp256k1-signer` (Rust) or `eth_yubihsm` (Python). Physical device; suitable for bridge-operator workstations.
   - **Ledger hardware wallet** — for one-off deploy steps and the five governor signers. Not suitable for automated per-tx signing.
2. **HMAC/API secrets go to a secrets manager.** These rotate; a manager gives you short-TTL credentials and audit trails. Any of Doppler, HashiCorp Vault, AWS Secrets Manager, 1Password Secrets, or GCP Secret Manager works — pick the one your org already operates.
3. **Config that isn't secret stays in `.env` (or `ConfigMap` in K8s).** Domain names, chain IDs, feature flags. Don't put them in the secrets store.

## Reference implementation — Docker Compose secrets

[`deploy/docker-compose.secrets.yaml`](../deploy/docker-compose.secrets.yaml) is an overlay that demonstrates the pattern for the three HMAC/API secrets called out in the task: `MCP_JWT_SECRET`, `WEAVIATE_API_KEY`, `AGENT_KEY_DEFAULT` (as an example of one agent key). It:

- Declares Docker Compose external secrets.
- Mounts them as files at `/run/secrets/<name>` in each consuming service.
- Overrides the corresponding `environment` entries with the `_FILE` convention so FastAPI / Node / Python readers pick them up.

Service code changes required (tracked separately, out of scope for this overlay):
- `services/mcp-gateway/app/*` — prefer `$FOO_FILE` over `$FOO` when both are set.
- `services/graph-rag-indexer/*` — same.
- `services/agent-swarm-runtime/src/main.py` — same.

Until those changes land, this overlay is a *target architecture* not a runnable artifact. Run it with the code changes or ignore it.

## Kubernetes / Akash notes

- **Kubernetes** — use the [External Secrets Operator](https://external-secrets.io) with a `ClusterSecretStore` pointing at your manager. Each `ExternalSecret` refreshes into a native `Secret` on a schedule; pods mount as env or files. Compatible with all the managers above.
- **Akash** — [SealedSecrets](https://github.com/akash-network/support/issues/76) is the supported pattern. At provision time the operator unseals against a provider-held key. Good for API secrets, not good for signing keys (those still need an HSM reachable from the workload).

## Migration order

1. Stand up the secrets manager (or HSM) in the target environment.
2. Upload every row from the inventory table above.
3. Add the `$FOO_FILE` fallback to each consumer (one PR per service).
4. Deploy with `deploy/docker-compose.secrets.yaml` (or the K8s / Akash equivalent).
5. Delete the raw values from `.env` — only placeholders remain.
6. Confirm the services still start, JWT still validates, attestations still verify.
7. Only then: rotate each secret for the first time and verify the whole stack survives a rotation without a restart.
