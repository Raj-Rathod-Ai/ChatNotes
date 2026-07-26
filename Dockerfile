# ── Base image ────────────────────────────────────────────────────────────────
# python:3.12-slim is small (~150 MB) and has no unnecessary extras.
FROM python:3.12-slim

# ── Working directory inside the container ────────────────────────────────────
WORKDIR /app

# ── Install dependencies FIRST (before copying source code) ───────────────────
# Docker caches each RUN layer. If only source code changes, this layer is
# reused and pip doesn't re-download anything — much faster builds.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy the rest of the source code ─────────────────────────────────────────
COPY . .

# ── Pre-download the embedding model INTO the image ───────────────────────────
# Without this, the very first /api/upload triggers a ~130 MB model download
# while the request is open — slow enough that Render's proxy returns a 502.
# Baking it in at build time means it's already on disk when the server starts.
RUN python -c "import rag; rag.get_embeddings().embed_query('warmup')"

# ── Port the app listens on ───────────────────────────────────────────────────
# Render injects a $PORT env var; we default to 8000 for local Docker runs.
ENV PORT=8000
EXPOSE 8000

# ── Start command ─────────────────────────────────────────────────────────────
# sh -c lets us expand $PORT at runtime (ENV alone doesn't work in CMD []).
CMD ["sh", "-c", "uvicorn backend:app --host 0.0.0.0 --port ${PORT}"]
