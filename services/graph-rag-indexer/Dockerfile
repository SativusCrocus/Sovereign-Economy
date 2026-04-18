# services/graph-rag-indexer/Dockerfile
# Sidecar image that runs the 4 ingester adapters against the Weaviate
# container. Keeps Weaviate itself at its upstream image (unmodified).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml /app/
RUN pip install --upgrade pip && pip install .

COPY src /app/src
COPY schema.json /app/schema.json

EXPOSE 9300
CMD ["python", "-m", "src.main"]
