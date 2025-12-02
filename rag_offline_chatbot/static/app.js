// =========================
// File: static/app.js
// Full-screen chatbot page logic
// =========================

document.addEventListener("DOMContentLoaded", () => {
  // ----- Auth elements -----
  const authPanel = document.getElementById("auth-panel");
  const usernameInp = document.getElementById("username");
  const passwordInp = document.getElementById("password");
  const loginBtn = document.getElementById("login-btn");
  const registerBtn = document.getElementById("register-btn");
  const authError = document.getElementById("auth-error");

  // ----- App elements -----
  const chat = document.getElementById("chat");
  const msgInput = document.getElementById("msg");
  const sendBtn = document.getElementById("send");
  const micBtn = document.getElementById("mic");
  const themeToggle = document.getElementById("themeToggle");
  const onboard = document.getElementById("onboard");
  const header = document.querySelector(".header");
  const controls = document.querySelector(".controls");
  const startChatBtn = document.getElementById("startChat");
  const logoutBtn = document.getElementById("logoutBtn");

  // Audio (optional)
  const sendSound = new Audio("/static/send.mp3");
  const typingSound = new Audio("/static/typing.mp3");

  // Set auth mode: hide header/chat while login/register
  const setAuthMode = (on) => {
    document.body.classList.toggle("auth-mode", !!on);
  };

  // Initial UI state
  if (authPanel) {
    setAuthMode(true);
    onboard.classList.add("hidden");
    header.classList.add("hidden");
    controls.classList.add("hidden");
    chat.classList.add("hidden");
  }

  // ---------- Utils ----------
  function safeEscapeHTML(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function timestamp() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function appendMessage(text, who = "bot") {
    const wrapper = document.createElement("div");
    wrapper.className = "msg-wrap";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.innerText = who === "user" ? "😊" : "💬";

    const msg = document.createElement("div");
    msg.className = "message " + (who === "user" ? "msg-user" : "msg-bot");
    msg.innerHTML =
      `<div>${safeEscapeHTML(text)}</div>` +
      `<div class="time">${timestamp()}</div>`;

    wrapper.appendChild(avatar);
    wrapper.appendChild(msg);

    if (who === "bot") {
      const react = document.createElement("div");
      react.className = "reactions";
      react.innerHTML = `<span>❤️</span> <span>😊</span> <span>👍</span>`;
      msg.appendChild(react);
    }

    chat.appendChild(wrapper);
    chat.scrollTop = chat.scrollHeight;
  }

  function typingBubble() {
    const wrap = document.createElement("div");
    wrap.className = "msg-wrap";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.innerText = "💬";

    const msg = document.createElement("div");
    msg.className = "message msg-bot";
    msg.innerHTML = `<span class="typing-dots"></span>`;

    wrap.appendChild(avatar);
    wrap.appendChild(msg);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;

    try { typingSound.play(); } catch (_) {}
    return wrap;
  }

  function clearChat() {
    chat.innerHTML = "";
  }

  // ---------- History ----------
  async function loadHistory() {
    try {
      const res = await fetch("/history");
      if (!res.ok) return;
      const data = await res.json();
      clearChat();
      (data.messages || []).forEach((m) =>
        appendMessage(m.content, m.role === "user" ? "user" : "bot")
      );
    } catch (err) {
      console.error("history error", err);
    }
  }

  // ---------- Auth flow ----------
  function showChatAfterAuth() {
    if (!authPanel) return;
    authPanel.classList.add("hidden");
    authError.textContent = "";
    onboard.classList.remove("hidden");
    header.classList.add("hidden");
    controls.classList.add("hidden");
    chat.classList.add("hidden");
    setAuthMode(true); // keep header hidden until Start Chat
  }

  async function authRequest(path) {
    const username = (usernameInp.value || "").trim();
    const password = (passwordInp.value || "").trim();
    authError.textContent = "";

    if (!username || !password) {
      authError.textContent = "Please enter username and password.";
      return;
    }

    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        authError.textContent = data.error || "Authentication failed.";
        return;
      }
      showChatAfterAuth();
    } catch (err) {
      console.error(err);
      authError.textContent = "Network error. Please try again.";
    }
  }

  async function doLogin() {
    await authRequest("/login");
  }

  async function doRegister() {
    await authRequest("/register");
  }

  // ---------- Logout ----------
  async function doLogout() {
    try {
      await fetch("/logout", { method: "POST" });
    } catch (e) {
      console.error("Logout failed:", e);
    }

    if (chat) chat.innerHTML = "";
    if (msgInput) msgInput.value = "";
    if (authPanel) {
      authPanel.classList.remove("hidden");
      const ae = document.getElementById("auth-error");
      if (ae) ae.textContent = "You have been logged out.";
    }
    onboard.classList.add("hidden");
    header.classList.add("hidden");
    controls.classList.add("hidden");
    chat.classList.add("hidden");
    setAuthMode(true);
  }

  // ---------- Start chat button ----------
  if (startChatBtn) {
    startChatBtn.onclick = async () => {
      if (authPanel && !authPanel.classList.contains("hidden")) {
        authError.textContent = "Please log in or register first.";
        return;
      }
      onboard.classList.add("hidden");
      header.classList.remove("hidden");
      controls.classList.remove("hidden");
      chat.classList.remove("hidden");
      setAuthMode(false); // show header/logout
      await loadHistory();
    };
  }

  // ---------- Send message ----------
  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;

    appendMessage(text, "user");
    msgInput.value = "";
    try { sendSound.play(); } catch (_) {}

    const typing = typingBubble();

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (res.status === 401) {
        typing.remove();
        appendMessage("You are not logged in. Please log in again.", "bot");
        if (authPanel) {
          authPanel.classList.remove("hidden");
          authError.textContent = "Session expired. Please log in again.";
          header.classList.add("hidden");
          controls.classList.add("hidden");
          chat.classList.add("hidden");
          onboard.classList.remove("hidden");
          setAuthMode(true);
        }
        return;
      }

      const data = await res.json();
      typing.remove();
      appendMessage(data.reply, "bot");
    } catch (err) {
      console.error(err);
      typing.remove();
      appendMessage("Something went wrong talking to the server.", "bot");
    }
  }

  // ---------- Listeners ----------
  if (loginBtn) loginBtn.addEventListener("click", doLogin);
  if (registerBtn) registerBtn.addEventListener("click", doRegister);
  if (logoutBtn) logoutBtn.addEventListener("click", doLogout);

  if (sendBtn) sendBtn.onclick = sendMessage;

  if (msgInput) {
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (micBtn) {
    micBtn.onclick = () => {
      if (!("webkitSpeechRecognition" in window)) {
        alert("Speech recognition not supported in this browser.");
        return;
      }
      const R = new webkitSpeechRecognition();
      R.lang = "en-US";
      R.onresult = (e) => {
        msgInput.value = e.results[0][0].transcript;
      };
      R.start();
    };
  }

  if (themeToggle) {
    themeToggle.onclick = () => document.body.classList.toggle("dark");
  }
});
