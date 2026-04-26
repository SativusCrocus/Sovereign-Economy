# Operations Runbook

This runbook is the **on-call source of truth** for deploying, promoting,
rolling back, rotating credentials, and recovering from incidents on the
Sovereign Economy stack. It assumes the reader has shell access to the
deploy host, an admin Ethereum wallet for the governor multisig, and
read/write access to the secrets manager.

If something is broken in production right now, jump to
[Incident response](#incident-response).

---

## Topology recap

One Docker host runs the prod stack via a 3-overlay compose merge:

| Overlay                                                                          | Role                                                                  |
|----------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| [docker-compose.yaml](../deploy/docker-compose.yaml)                             | Service graph (graph-rag-indexer, agent-swarm-runtime, mcp-gateway, …)|
| [docker-compose.prod.yaml](../deploy/docker-compose.prod.yaml)                   | Caddy reverse-proxy + ACME, drops dev TLS shortcuts                   |
| [docker-compose.tagged.yaml](../deploy/docker-compose.tagged.yaml)               | Pins each built image to `daes-<svc>:<git-sha>` for deterministic rollback |

Two env files drive two environments off the same overlay set:

| Env file                  | Domain namespace          | Image source                  |
|---------------------------|---------------------------|-------------------------------|
| `deploy/.env.staging`     | `*.staging.<your-domain>` | Built by `deploy-staging.sh`  |
| `deploy/.env`             | prod hostnames            | Re-uses staging-built images  |

---

## Deploy lifecycle

The three scripts live under `deploy/` and are also wired into the
Makefile. The intended flow:

```
git sha  ──(deploy-staging.sh)──▶ staging green ──(promote-to-prod.sh)──▶ prod
                                                                             │
                                                                             ▼
                                                                    rollback.sh ◀── prod red
```

Every step ends with `scripts/post-deploy-smoke.sh`. Smoke is the
contract: a sha that doesn't pass smoke is never recorded as
last-good and cannot be promoted.

### 1. Pre-deploy checklist

- [ ] `deploy/.env.staging` exists and `make preflight ENV_FILE=deploy/.env.staging` is green.
- [ ] `deploy/.env` exists and `make preflight` (defaults to prod) is green.
- [ ] `deploy/ipfs/swarm.key` exists, mode 600.
- [ ] DNS A records for `DAES_PUBLIC_DOMAIN`, `DAES_CONSOLE_DOMAIN`, `DAES_IPFS_DOMAIN` resolve to the deploy host.
- [ ] CI is green on `main` (or whatever sha you intend to deploy).
- [ ] If promoting to mainnet (`DAES_ALLOW_MAINNET=1`): Tier 4 audit complete, see [Mainnet promotion](#mainnet-promotion).

### 2. Deploy to staging

```bash
bash deploy/deploy-staging.sh                # uses HEAD
bash deploy/deploy-staging.sh <sha>          # any reachable git ref
```

What this does:
1. Resolves the ref to a 12-char short sha.
2. Runs preflight against `deploy/.env.staging`.
3. `docker compose build` with `DAES_TAG=<sha>` so each built image is
   tagged `daes-<svc>:<sha>` (not `latest`).
4. `docker compose up -d` against the staging compose merge.
5. Sleeps 15s then runs `post-deploy-smoke.sh`.
6. On success, writes the full sha to `deploy/.staging-last-good`.

**Failure mode:** smoke fails → script exits non-zero, stack stays up,
`.staging-last-good` is **not** updated. Inspect logs:

```bash
make logs                                    # tails the staging stack
```

Re-run after fixes, or tear down with `make staging-down`.

### 3. Promote staging → prod

```bash
bash deploy/promote-to-prod.sh               # uses .staging-last-good
bash deploy/promote-to-prod.sh <sha>         # operator override
```

Gating:
1. Refuses to run unless `deploy/.staging-last-good` exists and is < 24h old.
   Override with `STAGING_MAX_AGE_S=<seconds>`. Override sparingly — a
   stale staging run is the single most common path to a bad promotion.
2. Verifies all 5 expected images (`daes-rag-ingester`, `…-agent-swarm-runtime`,
   `…-goose-executor`, `…-mcp-gateway`, `…-frontend`) exist locally at
   the requested sha. If they're missing, abort — re-run staging.
3. If `DAES_ALLOW_MAINNET=1` is set in `deploy/.env`, an interactive y/N
   prompt blocks the promotion. See [Mainnet promotion](#mainnet-promotion).
4. Rotates `deploy/.prod-last-good` → `deploy/.prod-prev` **before**
   bringing the new stack up. This guarantees a usable rollback target
   even if the promotion crashes mid-way.
5. `docker compose up -d` against the prod env, **without --build** —
   the same images that passed staging smoke are what land in prod.
6. Smoke. On success, writes the sha to `deploy/.prod-last-good`.

### 4. Rollback

```bash
bash deploy/rollback.sh                      # uses .prod-prev
bash deploy/rollback.sh <sha>                # operator-pinned target
```

Behavior:
- Verifies the target sha's images are still on disk locally. If they
  aren't (gc'd, host wiped) the script aborts before touching the running
  stack — re-run `deploy-staging.sh <sha>` first to rebuild them, then
  retry rollback.
- Always interactive (TTY prompt) unless `ROLLBACK_NONINTERACTIVE=1`.
- After successful smoke, **does not rotate `.prod-prev`** — the
  rollback chain stays intact so you can roll back again if needed.

State files quick reference:

| File                                | Written by              | Used by              |
|-------------------------------------|-------------------------|----------------------|
| `deploy/.staging-last-good`         | `deploy-staging.sh`     | `promote-to-prod.sh` |
| `deploy/.prod-last-good`            | `promote-to-prod.sh`, `rollback.sh` | (informational) |
| `deploy/.prod-prev`                 | `promote-to-prod.sh`    | `rollback.sh` (default) |

All three are gitignored.

---

## Key rotation

Rotation cadences come from
[secrets-hardening.md → Secret inventory](secrets-hardening.md#secret-inventory).
Procedure for each category:

### MCP_JWT_SECRET (HMAC, every 30 days)

1. Generate a new 32-byte base64 secret in your secrets manager.
2. Re-mint `MCP_JWT` against the new secret (the swarm runtime does this
   on boot if both vars are set, but tooling and the operator console
   need the new pair too).
3. Update `deploy/.env.staging` and `deploy/.env`. Run
   `bash deploy/deploy-staging.sh` to rehearse — staging's JWT must
   verify before you touch prod.
4. `bash deploy/promote-to-prod.sh`. Existing sessions get 401 on their
   next request and re-authenticate against the new JWT.

### WEAVIATE_API_KEY (every 90 days)

Weaviate accepts one allowed key at a time. Plan a < 1-min outage:

1. Generate the new key.
2. Update both env files, deploy to staging, smoke.
3. Promote. The first request from each consumer will be rejected as the
   container restarts pick up the new key — keep an eye on
   `mcp-gateway` logs for the cutover.

### Agent signing keys (`AGENT_KEY_*`) and `DEPLOYER_PRIVATE_KEY`

Per [secrets-hardening.md → Rule of three](secrets-hardening.md#rule-of-three),
these never rotate by re-issuing material — they live in an HSM and you
rotate the **key ID**:

1. Generate a new keypair in the HSM (AWS KMS / YubiHSM / Ledger).
2. Fund the new EOA on each chain.
3. For agent keys: update the `_resolve_key` mapping in
   [services/mcp-gateway/app/handlers/wallet_sign.py](../services/mcp-gateway/app/handlers/wallet_sign.py).
   Deploy the new mapping through staging → prod.
4. For the deployer: it's only used by `contracts/scripts/deploy.ts` and
   one-off `cast` calls. Update the env, run a no-op staging deploy, then
   begin using the new deployer for prod transactions.
5. Drain and burn the old key:
   - Move all balances out of the old EOA on every chain it touched.
   - Revoke any HSM grants on the old key ID.
   - Document the rotation in your audit log.

### `DAES_SIGNER_<N>` (governor multisig signers)

Signer addresses are on-chain. To rotate one:

1. Generate the new signer keypair in HSM/hardware wallet.
2. Fund it with ~0.01 ETH on each governor chain.
3. From the governor: stage and approve a `rotateSigner(role, new)`
   transaction (3-of-5 quorum required).
4. Update the `DAES_SIGNER_<N>` placeholder in `deploy/.env` (it's
   informational off-chain) and `deploy/addresses/`.
5. Run `make staging-up` then `bash deploy/promote-to-prod.sh` to roll
   the address-table change.

### `DAES_HUMAN_GUARDIAN`

Special case: the guardian is the only address that can flip the circuit
breaker and bind the bridge. Rotation is manual and conscious.

1. Stage a `setGuardian(new)` action on the governor (3-of-5).
2. Wait until the action is executed and the on-chain `guardian()`
   returns the new address.
3. Update env + run staging → prod as above.

### `DAES_IPFS_PASS_HASH`

1. `make ipfs-pass` — prompts for a new password, writes the bcrypt hash
   into `deploy/.env`.
2. Mirror the change into `deploy/.env.staging` (use a different password
   for staging).
3. `bash deploy/deploy-staging.sh && bash deploy/promote-to-prod.sh`.
4. Distribute the new password to operators via your secrets manager
   (do not paste it in chat or commit).

---

## Mainnet promotion

The `DAES_ALLOW_MAINNET=1` flag in `deploy/.env` is the **only** thing
that lets contract deploy and bridge-execution code path target Base /
Optimism mainnet. Every check below must be done before flipping it.

- [ ] Tier 4 audit complete; report attached to the release tag.
- [ ] Findings ≥ Medium severity all marked **[RESOLVED]** in
      [audit-notes.md](audit-notes.md).
- [ ] Slither, solhint, Foundry invariants, Hardhat tests all green on
      the candidate sha.
- [ ] Echidna 24-hour campaign green on the candidate sha.
- [ ] On-chain `SwarmSeedVRF` deployed, funded, and `latestSeed()`
      non-zero — preflight verifies this.
- [ ] Multisig (3-of-5 governor) tested on testnet for at least one full
      stage/sign/execute cycle.
- [ ] Guardian wallet tested for circuit-breaker reset.
- [ ] `DAES_BRIDGE_OPERATOR` and `DAES_POSTER` keys provisioned in HSM.
- [ ] Pager-on-call rotation owns this stack.

Promotion procedure for the *first* mainnet deploy:

1. Set `DAES_ALLOW_MAINNET=1` in `deploy/.env` (uncomment the
   placeholder line in `.env.example`).
2. `bash deploy/deploy-staging.sh` against `deploy/.env.staging` — this
   rehearses the candidate sha against testnet, **not** mainnet.
3. `bash deploy/promote-to-prod.sh` — the script will detect the flag,
   print a red banner, and prompt for confirmation.
4. After the promotion exits 0, re-run preflight to confirm
   `latestSeed()` and `BASE_RPC_URL`/`OP_RPC_URL` resolve to mainnet.
5. Tail logs for at least one full bridge-attestation cycle before
   declaring done.

---

## Incident response

### Triage tree

1. **First, is the front door up?** From outside the deploy host:
   ```bash
   curl -fsS -o /dev/null -w '%{http_code}\n' https://$DAES_PUBLIC_DOMAIN/healthz
   ```
   - 200 → mcp-gateway is fine; check downstream services.
   - 502 / 503 → Caddy is up but mcp-gateway is unhealthy.
   - timeout / 521 → Caddy itself is down or DNS is wrong.

2. **From the host:**
   ```bash
   docker compose -f deploy/docker-compose.yaml \
                  -f deploy/docker-compose.prod.yaml \
                  -f deploy/docker-compose.tagged.yaml \
                  --env-file deploy/.env ps
   ```
   Anything not `running (healthy)` is a suspect. `make logs` for context.

3. **Is the on-chain side stuck?**
   ```bash
   cast call --rpc-url $SEED_VRF_RPC $SEED_VRF_CONTRACT 'latestSeed()(uint256)'
   ```
   Returns 0 → the VRF subscription drained or the request never
   landed. Re-fund the subscription and stage a `requestSeed()` from the
   governor.

### Common incidents

#### Caddy 502 on `/healthz`

`mcp-gateway` is unhealthy. Quick win:
```bash
docker compose ... restart mcp-gateway
```
If it doesn't recover within 30s, roll back:
```bash
bash deploy/rollback.sh
```

#### Caddy returns "no certificate available"

ACME failed to issue a cert. Check:
- DNS still points at this host (preflight section 3).
- Port 80 is reachable from the public internet (no NAT, no firewall).
- `DAES_ACME_EMAIL` is a valid mailbox.

If all fine, restart Caddy alone:
```bash
docker compose ... restart caddy
```
Caddy retries ACME with exponential backoff; the `caddy-data` volume
preserves state between restarts.

#### Circuit breaker tripped

The bridge has rejected enough attestations to trip the breaker. The
contract-level state is correct; the operator's job is to find out why:
```bash
cast call $CIRCUIT_BREAKER_ADDR 'failuresInWindow()(uint256)' --rpc-url $BASE_RPC_URL
```
- Inspect the most recent `OracleStale`, `QuorumMismatch`, etc. events.
- Resolve the underlying cause (e.g. RPC outage on a chain, oracle
  poster offline).
- The guardian resets the breaker via `breaker.reset()` from the
  human-guardian wallet.

#### IPFS HTTP gateway returns 401 for everyone, including the operator

The bcrypt hash got corrupted (often a copy/paste with a `$` getting
shell-expanded). Regenerate:
```bash
make ipfs-pass
bash deploy/deploy-staging.sh && bash deploy/promote-to-prod.sh
```

#### Suspected key compromise

Treat as P0:
1. Move balances off the affected EOA on every chain.
2. Revoke its HSM grant immediately.
3. Stage a governor action to remove it (`rotateSigner` for governor
   roles, redeploy with new env for agent keys).
4. Promote through staging → prod under the **24-hour staleness**
   override (this is the case it exists for).
5. Post-mortem within 48h.

### Escalation

- L1: deploy-host operator on call — rotate via the runbook.
- L2: protocol team — for governor / signer / breaker actions.
- L3: external security contact (named in the audit package).
- Never DM a private key. Use the secrets manager's share feature or a
  break-glass air-gapped channel.

---

## Cross-references

- [secrets-hardening.md](secrets-hardening.md) — secret inventory + HSM migration plan.
- [deploy-live.md](deploy-live.md) — first-time testnet deploy.
- [audit-notes.md](audit-notes.md) — resolved findings.
- [deploy-akash.md](deploy-akash.md) — Akash-specific notes.
- Top-level [Makefile](../Makefile) — `make help` lists every operator verb.
