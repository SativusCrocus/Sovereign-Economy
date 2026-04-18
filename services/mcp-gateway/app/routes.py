# services/mcp-gateway/app/routes.py
# Dynamically builds a POST /tools/{name} route per entry in
# spec.mcp_tools. Each route enforces the declared JWT scope and
# delegates to a real handler in app.handlers.
import logging
from fastapi import APIRouter, Body, Depends, HTTPException

from .auth import require_scope
from .handlers import HANDLERS

log = logging.getLogger("daes.mcp.routes")


def build_router(spec: dict) -> APIRouter:
    r = APIRouter(prefix="/tools")

    for tool in spec["mcp_tools"]:
        name = tool["name"]
        scopes = tool["required_permissions"]

        if name not in HANDLERS:
            log.warning("tool %s has no handler registered; skipping", name)
            continue

        def _make_handler(tool_name=name, handler=HANDLERS[name]):
            async def _endpoint(payload: dict = Body(...), claims=Depends(require_scope(scopes))):
                try:
                    result = await handler(payload)
                    return {"tool": tool_name, "ok": True, "result": result}
                except ValueError as ve:
                    raise HTTPException(400, str(ve))
                except Exception as e:
                    log.exception("tool %s failed", tool_name)
                    raise HTTPException(502, f"upstream failure: {e}")
            return _endpoint

        r.add_api_route(
            path=f"/{name}",
            endpoint=_make_handler(),
            methods=["POST"],
            summary=name,
            description=f"MCP tool: {name} (see spec/components.yaml::mcp_tools)",
        )

    return r
