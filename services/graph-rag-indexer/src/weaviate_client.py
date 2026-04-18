# services/graph-rag-indexer/src/weaviate_client.py
# Thin wrapper that creates the DAES schema on first boot (idempotent)
# and exposes a .upsert(class_name, obj_id, props) helper.
import json
import logging
import os
from pathlib import Path
from typing import Any

import weaviate
from weaviate.auth import AuthApiKey
from weaviate.classes.config import DataType, Property, Configure
from weaviate.exceptions import UnexpectedStatusCodeError

log = logging.getLogger("daes.ingester.weaviate")

WEAVIATE_URL = os.environ.get("WEAVIATE_URL", "http://graph-rag-indexer:8080")
WEAVIATE_KEY = os.environ.get("WEAVIATE_API_KEY", "")

_TYPE_MAP = {"text": DataType.TEXT, "number": DataType.NUMBER, "date": DataType.DATE}


def _connect() -> weaviate.WeaviateClient:
    return weaviate.connect_to_custom(
        http_host=WEAVIATE_URL.split("://", 1)[1].split(":")[0],
        http_port=int(WEAVIATE_URL.rsplit(":", 1)[1]) if WEAVIATE_URL.count(":") >= 2 else 8080,
        http_secure=WEAVIATE_URL.startswith("https"),
        grpc_host=WEAVIATE_URL.split("://", 1)[1].split(":")[0],
        grpc_port=50051,
        grpc_secure=False,
        auth_credentials=AuthApiKey(WEAVIATE_KEY) if WEAVIATE_KEY else None,
    )


def ensure_schema(schema_path: str | Path) -> None:
    schema = json.loads(Path(schema_path).read_text())
    client = _connect()
    try:
        existing = {c.name for c in client.collections.list_all().values()}
        for cls in schema["classes"]:
            if cls["class"] in existing:
                continue
            props = [
                Property(name=p["name"], data_type=_TYPE_MAP[p["dataType"][0]])
                for p in cls["properties"]
            ]
            client.collections.create(
                name=cls["class"],
                description=cls.get("description", ""),
                vectorizer_config=Configure.Vectorizer.none(),
                properties=props,
            )
            log.info("created collection %s", cls["class"])
    finally:
        client.close()


def upsert(collection: str, obj_id: str, props: dict[str, Any]) -> None:
    client = _connect()
    try:
        coll = client.collections.get(collection)
        try:
            coll.data.insert(properties=props, uuid=obj_id)
        except UnexpectedStatusCodeError:
            coll.data.update(uuid=obj_id, properties=props)
    finally:
        client.close()
