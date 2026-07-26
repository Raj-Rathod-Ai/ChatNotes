import os
import shutil
from pathlib import Path

# Force writable directories in /tmp for Render deployments (read-only filesystem by default)
if os.environ.get("RENDER") == "true":
    os.environ["DOCS_DIR"] = "/tmp/docs"
    os.environ["CHROMA_DIR"] = "/tmp/chroma_db"
    os.environ["FASTEMBED_CACHE"] = "/tmp/fastembed_cache"

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
import rag


DOCS_DIR = os.environ.get("DOCS_DIR", "docs")
app = FastAPI(title="chat with your notes")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_store = None
_curr_file = None


@app.on_event("startup")
def warm_up():
    # If on Render, copy pre-baked model cache from read-only image space (/app) to writable /tmp
    if os.environ.get("RENDER") == "true":
        src_cache = Path("/app/fastembed_cache")
        dest_cache = Path("/tmp/fastembed_cache")
        if src_cache.exists() and not dest_cache.exists():
            print(f"Copying pre-baked FastEmbed model cache from {src_cache} to {dest_cache}...")
            try:
                shutil.copytree(src_cache, dest_cache)
                print("Model cache copy completed.")
            except Exception as e:
                print(f"Warning: Failed to copy model cache: {e}")
            
    rag.get_embeddings()

def get_store():
    global _store
    if _store is None:
        try:

            _store = rag.load_index()
        except FileNotFoundError:
            pass
    return _store


@app.get("/api/status")
def status():
    return {
        "index_ready": get_store() is not None,
        "groq_key_set": bool(os.environ.get("GROQ_API_KEY")),
        "current_file": _curr_file,
    }

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    global _store, _curr_file
    if Path(file.filename).suffix.lower() not in (".pdf", ".txt", ".md"):
        raise HTTPException(400, "wrong file type")
    docs_dir = Path(DOCS_DIR)
    if docs_dir.exists():
        shutil.rmtree(docs_dir)
    docs_dir.mkdir(parents=True)
    dest = docs_dir / file.filename
    dest.write_bytes(await file.read())

    try:
        # Release vector store SQLite locks and run garbage collection before rebuilding
        global _store
        _store = None
        import gc
        gc.collect()
        
        _store = rag.build_index(DOCS_DIR)
    except ValueError as e:
        raise HTTPException(400, str(e))
    _curr_file = file.filename
    return {"ok": True, "filename": file.filename}

class ChatRequest(BaseModel):
    question: str

@app.post("/api/chat")
def chat(req: ChatRequest):
    import json
    store = get_store()
    if store is None:
        raise HTTPException(400, "no index")

    docs, token_gen = rag.answer(store, req.question)
    def event_stream():
        sources = [
            {"source": Path(d.metadata.get("source", "?")).name, "preview": d.page_content[:300]} for d in docs
        ]
        yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
        for t in token_gen:
            yield f"data: {json.dumps(t)}\n\n"
        yield "event: done\ndata: {}\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    },)



app.mount("/", StaticFiles(directory="static", html=True), name="static")