import os
import shutil
from pathlib import Path

# Detect read-only filesystem (typical for Render runtime containers running Docker)
is_readonly = False
try:
    test_dir = Path("./.write_test_dir")
    test_dir.mkdir(exist_ok=True)
    (test_dir / "test.txt").write_text("test")
    (test_dir / "test.txt").unlink()
    test_dir.rmdir()
except Exception:
    is_readonly = True

# Force writable directories in /tmp if we are on Render or running in a read-only filesystem
if is_readonly or os.environ.get("RENDER") == "true":
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


@app.on_event("startup")
def warm_up():
    # If on Render, copy pre-baked model cache from read-only image space (/app) to writable /tmp
    if os.environ.get("RENDER") == "true" or os.environ.get("FASTEMBED_CACHE") == "/tmp/fastembed_cache":
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
    files = []
    docs_dir = Path(DOCS_DIR)
    if docs_dir.exists():
        files = [f.name for f in docs_dir.glob("*") if f.suffix.lower() in (".pdf", ".txt", ".md")]
        
    groq_key = bool(os.environ.get("GROQ_API_KEY"))
    mistral_key = bool(os.environ.get("MISTRAL_API_KEY"))
    
    return {
        "index_ready": get_store() is not None,
        "groq_key_set": groq_key or mistral_key,
        "current_files": files,
    }

@app.get("/api/ping")
def ping():
    return {"status": "ok"}

@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...)):
    global _store
    docs_dir = Path(DOCS_DIR)
    docs_dir.mkdir(parents=True, exist_ok=True)
    
    saved_files = []
    for file in files:
        if Path(file.filename).suffix.lower() not in (".pdf", ".txt", ".md"):
            raise HTTPException(400, f"Unsupported file type: {file.filename}")
        dest = docs_dir / file.filename
        dest.write_bytes(await file.read())
        saved_files.append((file.filename, dest))

    try:
        # Get current store instance (loads it if exists, else returns None)
        store = get_store()
        if store is None:
            # If no store exists, initialize a new vector database
            _store = rag.build_index(DOCS_DIR)
        else:
            # Incremental update: For each uploaded file, clear its old chunks and add new chunks
            for filename, dest in saved_files:
                # Clear old chunks first in case the user is overwriting an existing file
                rag.remove_file_from_index(store, dest)
                # Add new chunks
                rag.add_file_to_index(store, dest)
    except ValueError as e:
        # Clean up saved files if indexing failed
        for filename, dest in saved_files:
            if dest.exists():
                dest.unlink()
        raise HTTPException(400, str(e))
        
    return {"ok": True, "filenames": [f[0] for f in saved_files]}

@app.post("/api/clear")
def clear_all():
    global _store
    # Clear vector store and force garbage collection
    _store = None
    import gc
    gc.collect()
    
    # Clear documents directory
    docs_dir = Path(DOCS_DIR)
    if docs_dir.exists():
        shutil.rmtree(docs_dir)
        docs_dir.mkdir(parents=True)
        
    # Delete chroma DB files
    chroma_dir = Path(rag.CHROMA_DIR)
    if chroma_dir.exists():
        try:
            shutil.rmtree(chroma_dir)
        except Exception as e:
            print(f"Warning: Failed to delete chroma directory: {e}")
            
    return {"ok": True}

class RemoveRequest(BaseModel):
    filename: str

@app.post("/api/remove_file")
def remove_file(req: RemoveRequest):
    global _store
    docs_dir = Path(DOCS_DIR)
    target = docs_dir / req.filename
    
    if not target.exists():
        raise HTTPException(404, "file not found")
        
    # Delete file from local storage
    target.unlink()
    
    # Determine remaining files
    remaining = [f for f in docs_dir.glob("*") if f.suffix.lower() in (".pdf", ".txt", ".md")]
    
    store = get_store()
    if not remaining:
        # No files remaining: clear global reference, force garbage collection, and purge DB files
        _store = None
        import gc
        gc.collect()
        
        chroma_dir = Path(rag.CHROMA_DIR)
        if chroma_dir.exists():
            try:
                shutil.rmtree(chroma_dir)
            except Exception as e:
                print(f"Warning: Failed to delete chroma directory: {e}")
    else:
        # Incremental removal: delete just the chunks of the removed file
        if store is not None:
            try:
                rag.remove_file_from_index(store, target)
            except Exception as e:
                # Fallback: if incremental delete fails, do a full rebuild
                print(f"Warning: Incremental deletion failed, rebuilding index: {e}")
                _store = None
                import gc
                gc.collect()
                _store = rag.build_index(DOCS_DIR)
            
    return {"ok": True}

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