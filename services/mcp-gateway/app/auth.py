# services/mcp-gateway/app/auth.py
import os
import jwt
from fastapi import HTTPException, Request

JWT_SECRET = os.environ.get("JWT_SECRET")


def require_scope(required: list[str]):
    def _dep(request: Request):
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            raise HTTPException(401, "missing bearer token")
        token = auth.split(" ", 1)[1]
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.PyJWTError as e:
            raise HTTPException(401, f"invalid token: {e}")
        scopes = set(claims.get("scope", "").split())
        missing = [s for s in required if s not in scopes]
        if missing:
            raise HTTPException(403, f"missing scopes: {missing}")
        return claims
    return _dep
