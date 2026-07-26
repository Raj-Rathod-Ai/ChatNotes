import os 
from pathlib import Path
os.environ.setdefault("ANONYMOUS_TELEMETRY", "false")
import logging
logging.getLogger("chromadb.telemetry").setLevel(logging.CRITICAL)

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser


PROMPT = ChatPromptTemplate.from_template("""

You are a helpful assistant answering questions about the user's uploaded notes
                                          base your answer primarily on the context below, synthesize and explain it in your own words, don't just copy lines verbatim, only reach for outside general knowledge in small amount 
                                          and only when it's needed to clarify a term or fill a small gap the notes don't cover. Stay focused on what the notes actually say, don't wander into a broader lecture on the topic. if you bring in something not in the CONTEXT, make it clear, when a fact comes from the notes, mention the source file
                                     
CONTEXT: {context}
QUESTION: {question}
ANSWER:
""")
    


CHROMA_DIR = os.environ.get("CHROMA_DIR", ".chroma_db")
EMB_CACHE = os.environ.get("FASTEMBED_CACHE","fastembed_cache")


def get_embeddings() -> FastEmbedEmbeddings:
    if not hasattr(get_embeddings, "_model"):
        get_embeddings._model = FastEmbedEmbeddings(model_name='BAAI/bge-small-en-v1.5', cache_dir=EMB_CACHE)
    return get_embeddings._model

def get_llm(model: str | None = None) -> ChatGroq:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set.")
    return ChatGroq(model=model or "llama-3.1-8b-instant", temperature=0)


def build_index(doc: str = "docs") -> Chroma:
    import shutil
    paths = [p for p in sorted(Path(doc).rglob("*"))
             if p.suffix.lower() in (".pdf", ".txt", ".md")]
             
    if not paths:
        raise ValueError(f"No documents found in {doc}.")
    if Path(CHROMA_DIR).exists():
        shutil.rmtree(CHROMA_DIR)
        
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    all_chunks = []
    
    for p in paths:
        loader = PyPDFLoader(str(p)) if p.suffix.lower() == ".pdf" else TextLoader(str(p), encoding="utf-8")
        all_chunks.extend(splitter.split_documents(loader.load()))
        
    store = Chroma.from_documents(
        all_chunks, 
        embedding=get_embeddings(), 
        persist_directory=CHROMA_DIR
    )
    return store


def load_index()->Chroma:
    if not Path(CHROMA_DIR).exists():
        raise FileNotFoundError(f"No index found at {CHROMA_DIR}")
    return Chroma(persist_directory=CHROMA_DIR,embedding=get_embeddings())

def format_docs(docs)->str:
    parts = []
    for doc in docs:
        src = Path(doc.metadata.get("source","Unknown")).name
        parts.append(f"""{src}\n{doc.page_content}""")
    return "\n\n---\n\n".join(parts)

def answer(store: Chroma, question: str, k: int = 4, model: str | None = None) -> tuple:
    retriever = store.as_retriever(search_kwargs={"k": k})
    docs = retriever.invoke(question)

    context = format_docs(docs)
    llm = get_llm(model)

    chain = PROMPT | llm | StrOutputParser()

    token_gen = chain.stream({"context": context, "question": question})
    return docs, token_gen
    
    