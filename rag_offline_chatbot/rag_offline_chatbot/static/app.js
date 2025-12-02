document.addEventListener("DOMContentLoaded", function() {
  const chat = document.getElementById("chat");
  const msgInput = document.getElementById("msg");
  const sendBtn = document.getElementById("send");
  const micBtn = document.getElementById("mic");

  function appendMessage(text, who="bot") {
    const div = document.createElement("div");
    div.className = "message " + (who === "user" ? "msg-user" : "msg-bot");
    div.innerText = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    appendMessage(text, "user");
    msgInput.value = "";
    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message: text})
      });
      const data = await res.json();
      if (data.reply) {
        appendMessage(data.reply, "bot");
        // browser TTS
        try {
          const utter = new SpeechSynthesisUtterance(data.reply);
          speechSynthesis.speak(utter);
        } catch (e) {
          console.warn("TTS not available", e);
        }
      } else if (data.error) {
        appendMessage("Error: " + data.error, "bot");
      }
    } catch (e) {
      appendMessage("Network error. Could not reach server.", "bot");
      console.error(e);
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  msgInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Voice input using Web Speech API (Chrome)
  micBtn.addEventListener("click", function(){
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Speech recognition not supported in this browser. Use Chrome.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function(event) {
      const transcript = event.results[0][0].transcript;
      msgInput.value = transcript;
    };
    recognition.onerror = function(event){
      console.error("Speech recognition error", event);
    };
    recognition.start();
  });
});
