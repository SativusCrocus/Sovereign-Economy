// contracts/scripts/extract-abi.ts
// Walks hardhat's artifacts directory, writes one ABI JSON per interface
// into contracts/abi/. Deterministic output order for reproducible builds.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ARTIFACTS = join(__dirname, "..", "artifacts", "interfaces");
const OUT       = join(__dirname, "..", "abi");

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith(".json") && !entry.name.endsWith(".dbg.json")) acc.push(p);
  }
  return acc;
}

const files = walk(ARTIFACTS).sort();
for (const f of files) {
  const artifact = JSON.parse(readFileSync(f, "utf8"));
  if (!artifact.abi || !artifact.contractName) continue;
  const dest = join(OUT, `${artifact.contractName}.abi.json`);
  writeFileSync(dest, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`wrote ${dest}`);
}
