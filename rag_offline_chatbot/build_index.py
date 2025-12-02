"""
Build FAISS index from data/knowledge.md using sentence-transformers embeddings.

Usage:
    python build_index.py

This will create:
- data/embeddings.npy
- data/documents.txt
- data/faiss_index.idx

Note: Requires sentence-transformers and faiss-cpu.
"""
import os
from pathlib import Path
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except Exception as e:
    print("Missing sentence_transformers. Install with: pip install sentence-transformers")
    raise

try:
    import faiss
except Exception as e:
    print("Missing faiss. Install with: pip install faiss-cpu")
    raise

DATA_FILE = Path("data/knowledge.md")
EMB_FILE = Path("data/embeddings.npy")
DOCS_FILE = Path("data/documents.txt")
INDEX_FILE = Path("data/faiss_index.idx")

def load_docs(path):
    text = path.read_text(encoding="utf-8")
    # naive split: paragraphs by blank lines
    parts = [p.strip() for p in text.split("\n\n") if p.strip()]
    return parts

def build():
    print("Loading documents...")
    docs = load_docs(DATA_FILE)
    print(f"{len(docs)} docs loaded.")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    print("Computing embeddings...")
    embeddings = model.encode(docs, show_progress_bar=True, convert_to_numpy=True)
    print("Saving embeddings and docs...")
    np.save(EMB_FILE, embeddings)
    DOCS_FILE.write_text("\n<<DOC_SEP>>\n".join(docs), encoding="utf-8")
    # build faiss index
    d = embeddings.shape[1]
    index = faiss.IndexFlatIP(d)  # use inner product on normalized vectors
    # normalize vectors
    faiss.normalize_L2(embeddings)
    index.add(embeddings)
    faiss.write_index(index, str(INDEX_FILE))
    print("Index built and saved to", INDEX_FILE)

if __name__ == "__main__":
    build()
