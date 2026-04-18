// frontend/lib/contracts.ts
// ABIs imported directly from the monorepo's contracts/abi/ output.
// next.config.mjs allows this via the implicit tsconfig "paths" root.
import governorAbi from "../../contracts/abi/IDAESGovernor.abi.json";
import bridgeAbi   from "../../contracts/abi/IBridgeExecutor.abi.json";
import cbAbi       from "../../contracts/abi/ICircuitBreaker.abi.json";
import oracleAbi   from "../../contracts/abi/ISwarmConsensusOracle.abi.json";
import accountAbi  from "../../contracts/abi/IAgentAccount.abi.json";
import oappAbi     from "../../contracts/abi/ILayerZeroOApp.abi.json";
import tlAbi       from "../../contracts/abi/IGuardianTimelock.abi.json";

export const ABIS = {
  governor: governorAbi,
  bridge:   bridgeAbi,
  breaker:  cbAbi,
  oracle:   oracleAbi,
  account:  accountAbi,
  oapp:     oappAbi,
  timelock: tlAbi,
} as const;
