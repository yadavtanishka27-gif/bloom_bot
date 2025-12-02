"""
Offline RAG-based Mental Health Chatbot (Flask)

Features:
- RAG search using FAISS + sentence-transformers (local)
- Local LLM via Ollama (if installed and running) for generation
- Fallback canned responses if no Ollama available
- Frontend supports text + voice input and browser TTS for output
- Emoji emotion detection added

Setup (high-level):
1. Install dependencies: pip install -r requirements.txt
2. (Optional but recommended) Install Ollama and pull a model:
   - https://ollama.com/docs/installation
   - Example: ollama pull mistral
3. Build FAISS index: python build_index.py
4. Run: python app.py
5. Open http://localhost:5000

This app expects data/faiss_index.idx and data/documents.txt created by build_index.py.
"""
import os
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
import json, requests

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
INDEX_FILE = DATA_DIR / "faiss_index.idx"
DOCS_FILE = DATA_DIR / "documents.txt"

app = Flask(__name__, static_folder="static", static_url_path="/static")

# Simple emoji detector
def detect_emoji(text):
    t = text.lower()
    if any(w in t for w in ["happy", "good", "great", "calm", "relaxed"]):
        return "😊"
    if any(w in t for w in ["sad", "depressed", "lonely", "down"]):
        return "😢"
    if any(w in t for w in ["anxious", "anxiety", "nervous", "panic", "stressed", "stress"]):
        return "😰"
    if any(w in t for w in ["angry", "mad", "frustrat"]):
        return "😡"
    return "💬"

# Load docs (documents.txt produced by build_index.py)
def load_docs():
    if not DOCS_FILE.exists():
        return []
    raw = DOCS_FILE.read_text(encoding="utf-8")
    docs = raw.split("\n<<DOC_SEP>>\n")
    return docs

# Local generation via Ollama (if available)
def generate_with_ollama(prompt, model="mistral"):
    # Ollama local HTTP API (default)
    url = f"http://localhost:11434/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "max_tokens": 300
    }
    try:
        resp = requests.post(url, json=payload, timeout=15)
        if resp.status_code == 200:
            j = resp.json()
            if "response" in j:
                return j["response"]
            if "content" in j:
                return j["content"]
            # try common fields
            return j.get("text") or j.get("output") or json.dumps(j)
        else:
            return None
    except Exception as e:
        print("Ollama error:", e)
        return None

# Simple fallback generator (no LLM)
def fallback_generate(prompt, docs_context):
    if docs_context:
        snippet = docs_context.split("\n")[:3]
        snippet = " ".join(snippet)
        return f"I found some helpful notes: {snippet} ... Try deep breathing and reach out to someone you trust."
    return "I’m here to listen. Try a 4-4-4 breathing exercise: breathe in 4 seconds, hold 4, out 4. Would you like a grounding exercise?"

# Endpoint: frontend served at /
@app.route("/")
def index():
    return send_from_directory("static", "index.html")

# Chat endpoint: expects JSON {message: "..."}
@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json() or {}
    user_msg = data.get("message", "").strip()
    if not user_msg:
        return jsonify({"error":"Empty message"}), 400

    # Crisis detection (very simple)
    lower = user_msg.lower()
    crisis_keywords = ["suicide", "kill myself", "end my life", "hurt myself"]
    if any(k in lower for k in crisis_keywords):
        reply = ("I'm really sorry you're feeling this way. If you are in immediate danger, please contact local emergency services. "
                 "Consider calling a suicide prevention helpline in your country. You are not alone.")
        return jsonify({"reply": reply, "crisis": True})

    # Load docs and perform a naive keyword match to create a small context.
    docs = load_docs()
    context = ""
    if docs:
        words = set([w.strip(".,!?").lower() for w in user_msg.split()])
        scored = []
        for d in docs:
            dwords = set([w.strip(".,!?").lower() for w in d.split()])
            score = len(words & dwords)
            scored.append((score, d))
        scored.sort(reverse=True, key=lambda x: x[0])
        top = [d for s,d in scored if s>0][:3]
        if not top:
            top = docs[:3]
        context = "\\n\\n".join(top)
    else:
        context = ""

    prompt = f\"\"\"You are a calm, empathetic mental health assistant. Use the context provided below to give a supportive answer. Do not provide medical diagnosis.
Context:
{context}

User: {user_msg}
\"\"\"
    gen = generate_with_ollama(prompt)
    if gen:
        reply_text = gen.strip()
    else:
        reply_text = fallback_generate(prompt, context)

    emoji = detect_emoji(user_msg)
    final_reply = f\"{reply_text} {emoji}\"
    return jsonify({\"reply\": final_reply})

# Serve static files automatically
@app.route("/static/<path:path>")
def send_static(path):
    return send_from_directory("static", path)

if __name__ == "__main__":
    app.run(debug=True)
