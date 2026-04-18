# services/mcp-gateway/app/main.py
# MCP gateway. Single public ingress, TLS on :8443, JWT auth with
# per-tool scope enforcement. Tool handlers are thin — they forward to
# upstream (Anvil, IPFS, LZ endpoints) and return structured results.
import os
import yaml
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Depends

from .auth import require_scope
from .routes import build_router

SPEC_PATH = os.environ.get("DAES_SPEC_PATH", "/spec/components.yaml")
TLS_CERT  = os.environ.get("TLS_CERT_PATH", "/tls/server.crt")
TLS_KEY   = os.environ.get("TLS_KEY_PATH",  "/tls/server.key")

with open(SPEC_PATH, "r") as f:
    SPEC = yaml.safe_load(f)

app = FastAPI(title="daes-mcp-gateway", version=SPEC["version"])


@app.get("/healthz")
def healthz():
    return {"status": "ok", "tools": [t["name"] for t in SPEC["mcp_tools"]]}


app.include_router(build_router(SPEC))


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8443,
        ssl_certfile=TLS_CERT,
        ssl_keyfile=TLS_KEY,
        log_level="info",
    )
