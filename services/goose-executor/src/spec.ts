// services/goose-executor/src/spec.ts
import { readFile } from "node:fs/promises";
import YAML from "yaml";

export interface DaesSpec {
  mcp_tools: Array<{
    name: string;
    max_latency_ms: number;
    retry: { policy: string; base_ms: number; max_attempts: number; jitter?: boolean };
    required_permissions: string[];
  }>;
  [k: string]: unknown;
}

export async function loadSpec(path = process.env.DAES_SPEC_PATH ?? "/spec/components.yaml"): Promise<DaesSpec> {
  const raw = await readFile(path, "utf8");
  return YAML.parse(raw) as DaesSpec;
}
