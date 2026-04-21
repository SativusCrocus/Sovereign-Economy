# Live Deploy Walk-through — Base Sepolia + OP Sepolia

End-to-end checklist for the first live deploy. Follows the Tier 2 plan (testnets now, mainnet gated until Tier 4 audit). Everything listed here runs from `contracts/`.

Time budget: ~30 minutes once credentials are in hand.

---

## 1. Pick an RPC provider

You need two endpoints — one per chain. Free tiers are fine for deploys.

| Provider | Base Sepolia | OP Sepolia |
|---|---|---|
| **Alchemy** (recommended) | https://dashboard.alchemy.com → Apps → Create → "Base Sepolia" | Same flow for "OP Sepolia" |
| QuickNode | https://dashboard.quicknode.com → Create Endpoint → Base Sepolia | Same for OP Sepolia |
| Infura | https://app.infura.io/dashboard → Networks: Base Sepolia + Optimism Sepolia |
| Public (rate-limited) | `https://sepolia.base.org` | `https://sepolia.optimism.io` |

Copy the two HTTPS URLs; you'll paste them as `BASE_SEPOLIA_RPC_URL` and `OP_SEPOLIA_RPC_URL` in `deploy/.env`.

If you expect any real traffic beyond the deploy itself, Alchemy's free tier (300M compute units/mo) is the easiest path. Public endpoints throttle aggressively and will drop mid-deploy on bad days.

---

## 2. Generate the 10 role keys

Run from the repo root:

```bash
bash scripts/gen-testnet-env.sh > /tmp/daes-testnet.env
cat /tmp/daes-testnet.env
```

That prints one deployer + five governor signers + bridge operator + poster + human guardian as freshly-generated EOAs. The full private keys are in the commented tail of the output — stash them in a password manager (1Password, Bitwarden, etc.). Do **not** commit.

Only the deployer key is loaded into `deploy/.env`; the other roles go in as addresses only. When you later need a signer or the guardian to actually sign a transaction (e.g. rotating a signer, or running `CircuitBreaker.setBridge` manually), you'll load its key into a wallet (MetaMask, `cast wallet import`, etc.) to sign a one-off tx.

**Testnet only.** For mainnet: generate keys on an air-gapped machine, store in an HSM / multisig, and never co-locate the deployer with role keys on the same box.

---

## 3. Fund the deployer on each chain

You need roughly **0.05 ETH** per chain — enough for ~7 contract deploys plus a few admin txs.

Faucets (copy the `DEPLOYER_*` address from step 2 into each):

- **Base Sepolia** — https://www.alchemy.com/faucets/base-sepolia (0.5 ETH/day per address, needs Alchemy account) or Coinbase Wallet faucet.
- **OP Sepolia** — https://www.alchemy.com/faucets/optimism-sepolia (same mechanics) or Superchain faucet https://console.optimism.io/faucet.

Confirm with:

```bash
cast balance <DEPLOYER_ADDR> --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast balance <DEPLOYER_ADDR> --rpc-url "$OP_SEPOLIA_RPC_URL"
```

If you need gas for the guardian later (to run `setBridge` manually or to reset the breaker), fund that address too — 0.01 ETH per chain is plenty.

---

## 4. Fill in `deploy/.env`

```bash
cp deploy/.env.example deploy/.env
```

Open `deploy/.env` and paste the block from step 2 on top of the placeholders. Also fill in:

```ini
BASE_SEPOLIA_RPC_URL=https://...       # from step 1
OP_SEPOLIA_RPC_URL=https://...         # from step 1

# The .env.example has non-deploy keys too (Weaviate, MCP JWT, Grafana admin,
# etc.). Fill whichever services you actually plan to run. The deploy script
# itself only needs the RPC URLs, DEPLOYER_PRIVATE_KEY, and the nine DAES_*
# address variables.
```

Sanity check — export the env and verify Hardhat can see it:

```bash
set -a && source deploy/.env && set +a
cd contracts
echo "deployer: $(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY)"
```

The printed address must equal `DEPLOYER_ADDR` from step 2.

---

## 5. Deploy to Base Sepolia

Still in `contracts/`, with the env loaded:

```bash
npx hardhat run scripts/deploy.ts --network baseSepolia
```

What to expect (roughly 45-90s end to end):

```
[deploy] network=baseSepolia chainId=84532 (Base Sepolia)
[deploy] deployer=0x1eB4...
[deploy] signers       = [...]
DAESGovernor         : 0x...
SwarmConsensusOracle : 0x...
CircuitBreaker       : 0x...
BridgeExecutor       : 0x...
GuardianTimelock     : 0x...
AgentAccountFactory  : 0x...
DAESOApp             : 0x... (endpoint 0x6EDC…, eid 40245)
CircuitBreaker.setBridge -> 0x...       # auto-runs IF deployer == guardian
[deploy] wrote .../deploy/addresses/baseSepolia.json
```

If the deployer and guardian are different addresses, the script skips `CircuitBreaker.setBridge` and prints the exact `cast send` command you need to run as the guardian. Do that before you issue any traffic through the bridge — unset, the breaker can never trip.

---

## 6. Deploy to OP Sepolia

```bash
npx hardhat run scripts/deploy.ts --network opSepolia
```

Same shape. Creates `deploy/addresses/opSepolia.json`.

---

## 7. Wire the OApp peers (Base ↔ OP)

The OApps deployed in steps 5-6 don't know about each other yet. `setPeer` is owner-gated on the DAESGovernor, so it flows through the 3-of-5 + 86400s pipeline.

Dry-run (prints the `setPeer` calldata plus a `cast send` you can hand the bridge operator):

```bash
npx hardhat run scripts/set-peers.ts --network baseSepolia
npx hardhat run scripts/set-peers.ts --network opSepolia
```

Auto-stage (only if the signer loaded in `DEPLOYER_PRIVATE_KEY` *is* the bridge operator):

```bash
npx hardhat run scripts/set-peers.ts --network baseSepolia -- --autostage
# then on each signer machine:
#   cast send <governor> "signAction(bytes32,uint8,bytes)" <actionId> <role> 0x
# wait 86400s, then:
#   cast send <governor> "executeAction(bytes32)" <actionId>
```

Repeat on `opSepolia`. After both peers are set, the OApps can send each other LayerZero messages.

---

## 8. Smoke-test it

From the Base Sepolia deploy, quote a tiny message to the OP Sepolia peer:

```bash
BASE_OAPP=$(jq -r .contracts.DAESOApp deploy/addresses/baseSepolia.json)
OP_EID=40232
cast call "$BASE_OAPP" "quoteSend(uint32,bytes,bytes,bool)(uint256,uint256)" \
  $OP_EID 0xdeadbeef 0x false --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

If that returns a non-zero `nativeFee`, the OApp is healthy end to end.

---

## Mainnet (Base + Optimism) — don't do this yet

`scripts/deploy.ts` refuses to target a mainnet chain unless you set `DAES_ALLOW_MAINNET=1`. Don't flip that flag until Tier 4 is complete:

- Third-party audit delivered (Trail of Bits / Spearbit / Code4rena — package at [docs/audit-package.md](audit-package.md))
- Audit findings remediated and re-reviewed
- Role keys migrated to HSM / hardware wallet / multisig

Then, same commands with `--network base` and `--network optimism`.
