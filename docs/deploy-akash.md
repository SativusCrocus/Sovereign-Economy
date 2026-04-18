# Deploying DAES to Akash

The SDL lives at [deploy/akash/deploy.yaml](../deploy/akash/deploy.yaml). This doc walks the human through a real deployment.

## Prerequisites (one-time)

1. **Akash CLI** — `curl -sSfL https://raw.githubusercontent.com/akash-network/provider/main/install.sh | sh`
2. **An AKT-funded wallet** — import a key with `akash keys add daes-deployer`. Fund with at least ~20 AKT (buffer covers escrow for one deployment for ~1 week).
3. **Publish images** — push a git tag matching `v*.*.*` to trigger [.github/workflows/publish-images.yml](../.github/workflows/publish-images.yml). Images land at `ghcr.io/<owner>/daes-*:<tag>`.
4. **Update SDL image tags** — replace the `1.0.0` placeholders in [deploy/akash/deploy.yaml](../deploy/akash/deploy.yaml) with your owner + tag, e.g.:
   ```bash
   sed -i.bak "s|ghcr.io/daes/|ghcr.io/SativusCrocus/daes-|g" deploy/akash/deploy.yaml
   ```
5. **Make images public** — GHCR packages default to private. In GitHub package settings, set visibility to public OR add `akash.network/akash-capabilities: docker-credentials` via a Kubernetes secret.

## The deploy

```bash
# 1. Validate the SDL parses + resources resolve (no bid required).
akash validate deploy/akash/deploy.yaml

# 2. Create the deployment on-chain. Returns a DSEQ.
akash tx deployment create deploy/akash/deploy.yaml \
  --from daes-deployer \
  --fees 5000uakt \
  --chain-id akashnet-2 \
  --node https://rpc.akashnet.net:443

# 3. Wait for bids (~1 min), then list them.
akash query market bid list \
  --owner "$(akash keys show daes-deployer -a)" \
  --state open \
  --node https://rpc.akashnet.net:443

# 4. Accept a bid matching the GPU-tier filter (a10/a100) on
#    agent-swarm-runtime. Check each bid's provider attributes first.
akash tx market lease create \
  --dseq <DSEQ> --gseq 1 --oseq 1 \
  --provider <PROVIDER_ADDR> \
  --from daes-deployer \
  --fees 5000uakt \
  --chain-id akashnet-2 \
  --node https://rpc.akashnet.net:443

# 5. Send the manifest to the provider.
akash provider send-manifest deploy/akash/deploy.yaml \
  --dseq <DSEQ> --provider <PROVIDER_ADDR> \
  --from daes-deployer

# 6. Get the public URI for mcp-gateway and grafana.
akash provider lease-status \
  --dseq <DSEQ> --provider <PROVIDER_ADDR> \
  --from daes-deployer
```

## Credential gap from this automation

The CI workflow can publish images but cannot run the `akash tx` commands because:

- **Wallet key** — `akash keys` is interactive and stores a keyring; exposing it in CI means trusting the runner with funds.
- **No GH Action exists** for Akash deployment (as of this writing) that maintains security review parity with the Docker push flow.

**Recommended path**: run steps 2-6 manually from a developer laptop or a dedicated deploy server whose machine state is audited. Treat the Akash wallet like a cold-ish hot wallet: separate key per environment, funded only with the minimum needed.

## Tearing down

```bash
akash tx deployment close \
  --dseq <DSEQ> \
  --from daes-deployer \
  --fees 5000uakt \
  --chain-id akashnet-2 \
  --node https://rpc.akashnet.net:443
```

Un-escrows remaining funds back to the deployer wallet.

## Monitoring after deploy

- `akash provider lease-status` returns the public `forwarded_ports` for `mcp-gateway:8443` and `grafana:3000`.
- Point Prometheus `external_labels` at your provider cluster so metrics aggregate correctly when you run `count: 2` replicas.
- The [SwarmSignalStalled](../config/alerts.yml) alert fires if the swarm goes quiet for 10m — use as a liveness probe beyond HTTP `/healthz`.
