// frontend/lib/contracts.ts
// ABIs vendored from contracts/abi/ so this directory builds standalone (e.g. on Vercel).
// Keep in sync with the upstream by running `scripts/sync-abi.sh` from repo root.
import governorAbi from "./abi/IDAESGovernor.abi.json";
import bridgeAbi   from "./abi/IBridgeExecutor.abi.json";
import cbAbi       from "./abi/ICircuitBreaker.abi.json";
import oracleAbi   from "./abi/ISwarmConsensusOracle.abi.json";
import accountAbi  from "./abi/IAgentAccount.abi.json";
import oappAbi     from "./abi/ILayerZeroOApp.abi.json";
import tlAbi       from "./abi/IGuardianTimelock.abi.json";

export const ABIS = {
  governor: governorAbi,
  bridge:   bridgeAbi,
  breaker:  cbAbi,
  oracle:   oracleAbi,
  account:  accountAbi,
  oapp:     oappAbi,
  timelock: tlAbi,
} as const;
