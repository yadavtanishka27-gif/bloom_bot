# =========================
# File: app.py  (Flask backend)
# =========================
import os
import re  # for cleaning model output
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, session
import json
import requests
from duckduckgo_search import DDGS
from collections import deque
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
INDEX_FILE = DATA_DIR / "faiss_index.idx"
DOCS_FILE = DATA_DIR / "documents.txt"

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.secret_key = "CHANGE_ME_TO_SOMETHING_RANDOM_AND_SECRET"  # CHANGE IN PROD

conversation_memory = deque(maxlen=5)

# --- User database (SQLite) config ---
USER_DB = ROOT / "/tmp/users.db"


# ----------------- AUTH DECORATOR -----------------
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return wrapper


# ----------------- DB HELPERS -----------------
def get_db_connection():
    conn = sqlite3.connect(USER_DB)
    conn.row_factory = sqlite3.Row
    return conn


def init_user_db():
    """Create users + conversations + messages tables."""
    conn = get_db_connection()
    cur = conn.cursor()

    # Users
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    # Conversations
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)"
    )

    # Messages
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user','bot')),
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(conversation_id) REFERENCES conversations(id)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages(conversation_id, id)"
    )

    conn.commit()
    conn.close()


init_user_db()


# ----------------- ROUTES TO FRONTENDS -----------------
@app.route("/")
def home():
    """
    BloomSpace landing page (wellness site).
    """
    return send_from_directory("static", "htweb.html")


@app.route("/chat-page")
def chat_page():
    """
    Full-screen chatbot UI page.
    """
    return send_from_directory("static", "index.html")


# ----------------- EMOJI & DOC HELPERS -----------------
def detect_emoji(text):
    t = text.lower()
    sadness = ["sad", "depressed", "hopeless", "cry", "lonely", "empty", "tired"]
    anxiety = ["anxious", "panic", "worried", "scared", "nervous", "overthinking"]
    anger = ["angry", "mad", "furious", "rage", "irritated"]
    happiness = ["happy", "excited", "great", "good", "relieved", "peaceful"]

    if any(w in t for w in sadness):
        return "😢"
    if any(w in t for w in anxiety):
        return "😰"
    if any(w in t for w in anger):
        return "😡"
    if any(w in t for w in happiness):
        return "😊"
    return "💬"


def load_docs():
    if not DOCS_FILE.exists():
        return []
    raw = DOCS_FILE.read_text(encoding="utf-8")
    docs = raw.split("\n<<DOC_SEP>>\n")
    return docs


# ---------- Ollama generate with stop tokens + env model ----------
def generate_with_ollama(prompt, model=None):
    url = "http://127.0.0.1:11434/api/generate"
    model = (model or os.getenv("OLLAMA_MODEL") or "phi").strip()
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "raw": True,
        "options": {
            "temperature": 0.45,
            "num_ctx": 512,
            "num_predict": 320,
            "stop": [
                "\nUSER:",
                "\nUser:",
                "\nCONTEXT:",
                "\nContext:",
                "\nASSISTANT:",
                "\nAssistant:",
                "\nSYSTEM:",
                "\nSystem:",
                "\nAnswer:",
            ],
        },
    }
    try:
        resp = requests.post(url, json=payload, timeout=90)
        if not getattr(resp, "ok", False):
            return None
        data = resp.json()
        return (data.get("response") or "").strip()
    except requests.exceptions.ConnectionError:
        return None
    except requests.exceptions.Timeout:
        return None
    except Exception:
        return None


# ---------- Cleaners ----------
_LABEL_CUT_MARKERS = [
    "\nUSER:",
    "\nUser:",
    "\nCONTEXT:",
    "\nContext:",
    "\nASSISTANT:",
    "\nAssistant:",
    "\nSYSTEM:",
    "\nSystem:",
]


def clean_llm_output(s: str) -> str:
    if not s:
        return s
    cut = len(s)
    for m in _LABEL_CUT_MARKERS:
        i = s.find(m)
        if i != -1:
            cut = min(cut, i)
    s = s[:cut]
    s = re.sub(r"^\s*(ASSISTANT:|Assistant:|RESPONSE:|Response:)\s*", "", s)
    return s.strip()


def remove_question_echo(user_msg: str, response: str) -> str:
    """Drop lines that just restate the user's question."""
    if not response:
        return response
    u = re.sub(r"\s+", " ", user_msg).strip().lower().rstrip(".?!")
    out_lines = []
    for line in response.splitlines():
        t = re.sub(r"\s+", " ", line).strip().lower().rstrip(".?!")
        if not t:
            continue
        if t == u or t.endswith(u) or u.endswith(t):
            continue
        out_lines.append(line)
    cleaned = "\n".join(out_lines).strip()
    return cleaned or response


def is_low_quality(user_msg: str, response: str) -> bool:
    """Heuristic: too short, equals question, or generic filler."""
    if not response:
        return True
    r = response.strip()
    if len(r) < 25:
        return True
    u = user_msg.strip().lower().rstrip(".?!")
    if r.lower().rstrip(".?!") == u:
        return True
    if "tell me more about what you're feeling" in r.lower():
        return True
    return False


# ---------- Offline therapy playbook (strong fallback) ----------
def therapy_playbook_reply(user_msg: str) -> str | None:
    t = user_msg.lower()

    # Body image / fear of judgement
    if any(
        k in t
        for k in [
            "body image",
            "too fat",
            "fat",
            "overweight",
            "weight",
            "appearance",
            "judged",
            "judgment",
            "judgement",
            "look ugly",
            "look bad",
        ]
    ):
        return (
            "I hear how heavy this feels—fearing judgment about your body can be exhausting.\n"
            "- Name the inner critic → label those thoughts as thoughts, not facts.\n"
            "- Reframe comparisons → follow accounts that are body-neutral/positive; unfollow triggers.\n"
            "- Values first → choose movement/meals for energy & care, not punishment.\n"
            "- Gradual exposure → wear a comfortable outfit in low-stakes settings; notice predictions vs actual reactions.\n"
            "- Limit checking/rumination → set small windows (e.g., one mirror check), then redirect to activity.\n"
            '- Self-talk cue → “I’m learning to treat my body kindly while living my life.”\n'
            "If eating patterns feel out of control (restriction, binge, purge), consider talking to a clinician for tailored support."
        )

    # PTSD / trauma coping
    if "ptsd" in t or "trauma" in t or "post traumatic" in t:
        return (
            "Thanks for reaching out—coping with trauma is hard, and you’re not alone.\n"
            "- Grounding: 5-4-3-2-1 with senses; pair with slow exhale (6s) breaths.\n"
            "- Triggers plan: list common triggers → choose a brief script + exit option.\n"
            "- Body regulation: paced breathing, cold water splash, or a short walk to reset arousal.\n"
            "- Night support: wind-down routine; keep a note pad to externalize intrusive thoughts.\n"
            "- Values micro-steps: one small, safe action that moves life forward today.\n"
            "If nightmares, flashbacks, or hyperarousal persist, evidence-based therapies (e.g., TF-CBT, EMDR) can help—consider a licensed professional."
        )

    # Social anxiety / fear of judgment
    if any(
        k in t
        for k in [
            "fear of judgment",
            "fear of judgement",
            "being judged",
            "people judging",
            "social anxiety",
        ]
    ):
        return (
            "That fear of being judged can feel intense—I get it.\n"
            "- Prediction test: write your feared outcome; run a tiny exposure; compare prediction vs outcome.\n"
            "- Attention shift: place a small object in your pocket; when you notice self-focus, touch it and notice the room (sounds, colors).\n"
            "- Self-compassion: talk to yourself as you would to a close friend; short kind phrase works.\n"
            "- Post-event review: list 2 things that went OK before any critique.\n"
            "- Ladder it: build exposures from easiest → harder over days, not all at once."
        )

    # Sleep difficulties
    if any(
        k in t
        for k in [
            "trouble sleeping",
            "insomnia",
            "can't sleep",
            "cant sleep",
            "sleep problem",
        ]
    ):
        return (
            "Sleep trouble is rough—here are bite-size steps:\n"
            "- Consistent wake time; light exposure within an hour of waking.\n"
            "- Wind-down 45–60 min; no problem-solving in bed—use a worry pad earlier.\n"
            "- If awake >20–30 min, get up to a dim-light, low-stimulation activity; return when sleepy.\n"
            "- Caffeine cutoff ~8h before bed; alcohol often worsens sleep quality."
        )

    # General “help me” support
    if any(
        k in t
        for k in ["help", "solve", "ways", "how to", "what to do"]
    ):
        return (
            "Let’s make this practical:\n"
            "- Name the problem in one sentence; pick one tiny next step.\n"
            "- Schedule it on your calendar; 10–15 minutes is enough to start.\n"
            "- Remove one friction (prep item, ask for help, set reminder).\n"
            "- After, record one thing that went better than expected."
        )

    return None


def fallback_generate(user_msg):
    t = user_msg.lower()
    if any(
        w in t
        for w in [
            "body image",
            "eating disorder",
            "anorexia",
            "bulimia",
            "binge",
            "purge",
            "disordered eating",
        ]
    ):
        return (
            "Thank you for sharing that—body image and eating concerns can feel heavy. "
            "If it helps, we can talk about what you’ve been experiencing, any triggers you notice, and small steps for support. "
            "If symptoms affect your health or daily life, consider speaking with a licensed professional for tailored care."
        )
    if any(
        w in t for w in ["depressed", "sad", "hopeless", "empty", "lonely", "worthless"]
    ):
        return (
            "I'm really sorry you're feeling this low. Depression can make everything feel heavy and exhausting. "
            "If possible, try to talk to someone you trust or consider reaching out to a counselor."
        )
    if any(
        w in t for w in ["anxious", "panic", "nervous", "worried", "overthinking"]
    ):
        return (
            "Feeling anxious can be overwhelming. Try slowing your breathing — in for 4, hold for 4, out for 6. "
            "You're safe right now; grounding steps can help calm your system."
        )
    if any(
        w in t for w in ["stressed", "pressure", "burned out", "overworked"]
    ):
        return (
            "Stress builds up fast. Even small breaks, stretching, or stepping away briefly can help. "
            "It's okay to slow down when things feel overwhelming."
        )
    if any(w in t for w in ["angry", "mad", "frustrated", "rage"]):
        return (
            "It sounds like you're feeling very frustrated or angry. "
            "Taking a moment to breathe and step back can help you regain balance."
        )
    if any(w in t for w in ["error", "bug", "flask", "python", "api", "server"]):
        return "Share the exact error message and I’ll help fix it."
    return "I’m here with you. Tell me more about what you're feeling."


def retrieve_context(query):
    try:
        docs = load_docs()
        if not docs:
            return ""
        words = set(query.lower().split())
        scored = []
        for d in docs:
            dwords = set(d.lower().split())
            score = len(words & dwords)
            scored.append((score, d))
        scored.sort(reverse=True, key=lambda x: x[0])
        top = [d for s, d in scored if s > 0][:3]
        if not top:
            top = docs[:3]
        return "\n\n".join(top)
    except Exception as e:
        print("RAG Error:", e)
        return ""


def web_search(query):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
            if not results:
                return None
            combined = ""
            for r in results[:3]:
                combined += f"- {r['title']}: {r['body']}\n"
            return combined.strip()
    except Exception as e:
        print("Web search error:", e)
        return None


def detect_mode_llm(user_msg):
    classify_prompt = f"""
You are a classifier. Classify the user's message into ONLY ONE of these modes:
medical
therapy
technical
general

User message: {user_msg}
Return ONLY the mode word.
"""
    result = generate_with_ollama(classify_prompt)
    if not result:
        return "general"
    mode = result.strip().lower()
    return mode if mode in {"medical", "therapy", "technical", "general"} else "general"


# ----------------- CONVERSATION HELPERS -----------------
def create_conversation(user_id: int, title: str | None = None) -> int:
    title = title or "Conversation"
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO conversations (user_id, title, created_at, updated_at) "
        "VALUES (?, ?, datetime('now'), datetime('now'))",
        (user_id, title),
    )
    conv_id = cur.lastrowid
    conn.commit()
    conn.close()
    return conv_id


def get_or_create_active_conversation(user_id: int) -> int:
    # Reuse session conv if valid and belongs to user
    conv_id = session.get("conv_id")
    if conv_id:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM conversations WHERE id=? AND user_id=?",
            (conv_id, user_id),
        )
        row = cur.fetchone()
        conn.close()
        if row:
            return conv_id

    # Otherwise pick latest or create new
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM conversations WHERE user_id=? "
        "ORDER BY updated_at DESC, id DESC LIMIT 1",
        (user_id,),
    )
    row = cur.fetchone()
    if row:
        conv_id = row["id"]
    else:
        conv_id = create_conversation(user_id, "Today’s chat")
    conn.close()
    session["conv_id"] = conv_id
    return conv_id


def list_messages(conversation_id: int, limit: int = 200):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, role, content, created_at
        FROM messages
        WHERE conversation_id=?
        ORDER BY id ASC
        LIMIT ?
        """,
        (conversation_id, limit),
    )
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_message(conversation_id: int, user_id: int, role: str, content: str):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO messages (conversation_id, user_id, role, content, created_at) "
        "VALUES (?, ?, ?, ?, datetime('now'))",
        (conversation_id, user_id, role, content),
    )
    cur.execute(
        "UPDATE conversations SET updated_at=datetime('now') WHERE id=?",
        (conversation_id,),
    )
    conn.commit()
    conn.close()


# ----------------- AUTH ROUTES -----------------
@app.route("/register", methods=["POST"])
def register():
    """
    Expects JSON: { "username": "...", "password": "..." }
    """
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    password_hash = generate_password_hash(password)
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (username, password_hash, created_at) "
            "VALUES (?, ?, datetime('now'))",
            (username, password_hash),
        )
        conn.commit()
        user_id = cur.lastrowid
        conn.close()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already taken"}), 409

    # auto-login + new conversation
    session["user_id"] = user_id
    session["username"] = username
    conv_id = create_conversation(user_id, "Welcome")
    session["conv_id"] = conv_id
    return jsonify(
        {
            "message": "Registered successfully",
            "user_id": user_id,
            "username": username,
            "conversation_id": conv_id,
        }
    )


@app.route("/login", methods=["POST"])
def login():
    """
    Expects JSON: { "username": "...", "password": "..." }
    """
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    conn.close()

    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid username or password"}), 401

    session["user_id"] = row["id"]
    session["username"] = row["username"]
    conv_id = get_or_create_active_conversation(row["id"])
    return jsonify(
        {
            "message": "Logged in successfully",
            "user_id": row["id"],
            "username": row["username"],
            "conversation_id": conv_id,
        }
    )


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"})


# ----------------- HISTORY & CONVERSATIONS -----------------
@app.route("/history", methods=["GET"])
@login_required
def history():
    user_id = session["user_id"]
    conv_id = get_or_create_active_conversation(user_id)
    msgs = list_messages(conv_id, limit=500)
    return jsonify({"conversation_id": conv_id, "messages": msgs})


@app.route("/conversations", methods=["GET", "POST"])
@login_required
def conversations():
    user_id = session["user_id"]
    if request.method == "POST":
        data = request.get_json() or {}
        title = (data.get("title") or "").strip() or "New chat"
        conv_id = create_conversation(user_id, title)
        session["conv_id"] = conv_id
        return jsonify({"conversation_id": conv_id, "title": title})

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT c.id, c.title, c.created_at, c.updated_at,
               (SELECT COUNT(1) FROM messages m WHERE m.conversation_id=c.id) as message_count
        FROM conversations c
        WHERE c.user_id=?
        ORDER BY c.updated_at DESC
        """,
        (user_id,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify({"conversations": rows, "active": session.get("conv_id")})


@app.route("/conversations/switch", methods=["POST"])
@login_required
def switch_conversation():
    user_id = session["user_id"]
    data = request.get_json() or {}
    conv_id = int(data.get("conversation_id", 0))
    if not conv_id:
        return jsonify({"error": "conversation_id required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM conversations WHERE id=? AND user_id=?",
        (conv_id, user_id),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Conversation not found"}), 404

    session["conv_id"] = conv_id
    return jsonify({"message": "Switched", "conversation_id": conv_id})


# ----------------- CHAT -----------------
@app.route("/chat", methods=["POST"])
@login_required
def chat():
    data = request.get_json() or {}
    user_msg = (data.get("message") or "").strip()
    user_id = session.get("user_id")

    if not user_msg:
        return jsonify({"reply": "Please share what you are feeling. 💬"}), 400

    conv_id = get_or_create_active_conversation(user_id)

    # Crisis check (not stored until verified)
    lower = user_msg.lower()
    crisis_keywords = ["suicide", "kill myself", "end my life", "hurt myself"]
    if any(k in lower for k in crisis_keywords):
        reply = (
            "I'm really sorry you're feeling this way. If you are in immediate danger, "
            "please contact local emergency services. Consider calling a suicide prevention "
            "helpline in your country. You are not alone."
        )
        # Store both messages to the transcript
        insert_message(conv_id, user_id, "user", user_msg)
        insert_message(conv_id, user_id, "bot", reply)
        return jsonify({"reply": reply, "crisis": True})

    # Store user message
    insert_message(conv_id, user_id, "user", user_msg)

    # Routing for retrieval
    mode = detect_mode_llm(user_msg)
    live_keywords = [
        "latest",
        "news",
        "today",
        "current",
        "update",
        "price",
        "weather",
    ]
    medical_trigger = any(
        w in lower
        for w in ["symptoms", "causes", "treatment", "disease", "disorder", "ptsd", "trauma"]
    )

    if mode == "medical" or any(w in lower for w in live_keywords) or medical_trigger:
        context = web_search(user_msg) or ""
    else:
        context = retrieve_context(user_msg)

    prompt = f"""You are a supportive, trauma-informed mental-health assistant.
Use the context only if helpful. Reply as PLAIN TEXT only.
Do NOT restate or paraphrase the user's question.
Structure:
- 1 short validation sentence
- 4–6 concise, practical tips as bullet points
- 1 gentle sign-off
Avoid clinical diagnosis/treatment instructions. Not a substitute for professional care.

Context (optional):
{context}

User:
{user_msg}

Answer:"""

    gen = generate_with_ollama(prompt)

    if isinstance(gen, str) and gen.strip():
        reply_text = clean_llm_output(gen).strip()
        reply_text = remove_question_echo(user_msg, reply_text)
        # Use playbook if the result is low-quality (echo/too short)
        if is_low_quality(user_msg, reply_text):
            play = therapy_playbook_reply(user_msg)
            reply_text = play or fallback_generate(user_msg)
    else:
        # LLM missing/unreachable → strong offline playbook first
        play = therapy_playbook_reply(user_msg)
        reply_text = play or fallback_generate(user_msg)

    emoji = detect_emoji(user_msg)
    final_reply = f"{reply_text} {emoji}"

    # Store bot reply
    insert_message(conv_id, user_id, "bot", final_reply)

    # Also keep ephemeral memory
    conversation_memory.append(f"User: {user_msg}")
    conversation_memory.append(f"Bot: {final_reply}")

    return jsonify({"reply": final_reply, "conversation_id": conv_id})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)
