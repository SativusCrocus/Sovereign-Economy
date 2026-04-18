// services/goose-executor/scripts/sim-buy-signal.ts
// Simulates a swarm BUY signal end-to-end for smoke testing.
import { request } from "undici";

const url = process.env.GOOSE_URL ?? "http://localhost:9200";
const res = await request(`${url}/swarm-signal`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    kind: "BUY",
    payload: {
      chain_id: 31337,
      block_tag: "latest",
      from: "0x0000000000000000000000000000000000000001",
      to:   "0x0000000000000000000000000000000000000002",
      data: "0x",
    },
  }),
});
const body = await res.body.json();
console.log(JSON.stringify(body, null, 2));
