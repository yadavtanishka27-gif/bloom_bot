# Offline RAG-Based Mental Health Chatbot (No API Key)

This project demonstrates a Retrieval-Augmented Generation (RAG) mental health chatbot that runs **offline** and **does not require an OpenAI API key**. It uses a local knowledge base, FAISS for similarity search, and a local LLM via Ollama (optional). The frontend supports voice input and browser TTS.

## What you get
- `build_index.py` — build embeddings and FAISS index from `data/knowledge.md`
- `app.py` — Flask app serving the frontend and chat endpoint
- `data/knowledge.md` — sample mental health knowledge base
- `static/` — frontend files (voice input, emoji, TTS)
- `requirements.txt` — Python dependencies

## Recommended setup (Windows / macOS / Linux)
1. Create a Python virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate   # macOS / Linux
   venv\\Scripts\\activate    # Windows (PowerShell)
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. (Optional but recommended) Install Ollama for a local LLM:
   - Visit https://ollama.com/docs/installation and follow instructions for your OS.
   - Pull a model, e.g.:
     ```
     ollama pull mistral
     ```
   - Run the Ollama daemon (usually installed as a service). The app will try to call `http://localhost:11434/api/generate`.

   If Ollama is not installed, the app will use a safe fallback response.

4. Build the FAISS index (this produces `data/faiss_index.idx` and `data/documents.txt`):
   ```
   python build_index.py
   ```

5. Run the Flask app:
   ```
   python app.py
   ```

6. Open `http://localhost:5000` in Chrome (for voice input) and try the chatbot.

## How it works (simplified)
- User message is sent to the backend.
- The backend retrieves relevant paragraphs from `data/knowledge.md` using a simple matching or FAISS index (if built).
- The backend sends the user message plus retrieved context to a local LLM (Ollama) for generation. If Ollama is not available, the app returns a conservative fallback supportive message.
- The frontend reads the reply aloud using browser TTS and displays an emoji reflecting detected emotion.

## Notes & Safety
- This is for educational/demo purposes only — not a medical device.
- Crisis detection is simple keyword-based. For production, integrate professional-grade risk assessment and human escalation.
- Do not publish sensitive personal data.

## Extending the project
- Replace fallback with a stronger local model.
- Add user auth and per-user history.
- Add better ranker and long-term memory storage.
