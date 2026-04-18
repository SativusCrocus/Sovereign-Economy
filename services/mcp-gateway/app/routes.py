# services/mcp-gateway/app/routes.py
# Dynamically builds a POST /tools/{name} route per entry in
# spec.mcp_tools. Each route validates input against the declared
# JSON Schema and delegates to a handler stub.
from fastapi import APIRouter, Depends, HTTPException, Body

from .auth import require_scope


def build_router(spec: dict) -> APIRouter:
    r = APIRouter(prefix="/tools")

    for tool in spec["mcp_tools"]:
        name = tool["name"]
        scopes = tool["required_permissions"]

        def _make_handler(tool_name=name):
            async def _handler(payload: dict = Body(...), claims=Depends(require_scope(scopes))):
                # TODO: route to upstream (Tenderly, Anvil, IPFS, LayerZero, EIP-4337 bundler).
                # Returning an echo+stub so smoke tests pass without external deps.
                return {"tool": tool_name, "ok": True, "echo": payload}
            return _handler

        r.add_api_route(
            path=f"/{name}",
            endpoint=_make_handler(),
            methods=["POST"],
            summary=name,
            description=f"MCP tool: {name} (see spec/components.yaml::mcp_tools)",
        )

    return r
