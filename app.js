// ====== 설정 ======
const FRIENDS = ["민지", "준호", "서연", "태오"];

// 🔥 여기만 네 Vercel 주소로 바꾸면 됨
const API_URL = "https://YOUR-VERCEL-PROJECT.vercel.app/api/chat";

const STORAGE_KEY = "chatroom_messages_v1";
const SUMMARY_KEY = "chatroom_summary_v1";

// (선택) 프사 사용하면 여기 매핑
const AVATARS = {
  me: "avatars/me.png",
  "민지": "avatars/minji.png",
  "준호": "avatars/junho.png",
  "서연": "avatars/seoyeon.png",
  "태오": "avatars/taeo.png"
};

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

// ====== 유틸 ======
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadMessages() {
  const parsed = loadJson(STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveMessages(messages) {
  saveJson(STORAGE_KEY, messages);
}

function loadSummary() {
  const s = localStorage.getItem(SUMMARY_KEY);
  return typeof s === "string" ? s : "";
}

function saveSummary(summary) {
  localStorage.setItem(SUMMARY_KEY, summary || "");
}

// ====== 렌더 ======
function renderSystem(text) {
  const sys = document.createElement("div");
  sys.className = "system-msg";
  sys.textContent = text;
  chatEl.appendChild(sys);
}

function renderMessage(msg) {
  // msg: { from: "me" | friendName, text: string, ts: number }

  if (msg.from === "me") {
    const bubble = document.createElement("div");
    bubble.className = "msg me";
    bubble.innerHTML = escapeHtml(msg.text);
    chatEl.appendChild(bubble);
    return;
  }

  // friend (프사 포함 버전)
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "flex-start";
  row.style.gap = "8px";

  const img = document.createElement("img");
  img.className = "avatar";
  img.src = AVATARS[msg.from] || "";
  img.alt = msg.from;

  const col = document.createElement("div");

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = msg.from;

  const bubble = document.createElement("div");
  bubble.className = "msg friend";
  bubble.innerHTML = escapeHtml(msg.text);

  col.appendChild(name);
  col.appendChild(bubble);

  // 프사 파일 없으면 이미지 숨김(깨진 아이콘 방지)
  img.onerror = () => (img.style.display = "none");
  row.appendChild(img);
  row.appendChild(col);

  chatEl.appendChild(row);
}

function renderAll(messages) {
  chatEl.innerHTML = "";
  if (!messages.length) {
    renderSystem("대화를 시작해 보세요");
    return;
  }
  messages.forEach(renderMessage);
  scrollToBottom();
}

// ====== 상태 ======
let messages = loadMessages();
let summary = loadSummary();
renderAll(messages);

function addMessage(from, text) {
  const msg = { from, text, ts: Date.now() };
  messages.push(msg);
  saveMessages(messages);
  renderAll(messages);
}

function setSendingState(isSending) {
  sendBtn.disabled = isSending;
  inputEl.disabled = isSending;
  sendBtn.textContent = isSending ? "전송중" : "전송";
}

// “입력중…” 표시용(가짜)
let typingEl = null;
function showTyping() {
  if (typingEl) return;
  typingEl = document.createElement("div");
  typingEl.className = "system-msg";
  typingEl.textContent = "친구들이 입력중…";
  chatEl.appendChild(typingEl);
  scrollToBottom();
}
function hideTyping() {
  if (!typingEl) return;
  typingEl.remove();
  typingEl = null;
}

// ====== API 호출 ======
async function fetchFriendsReply(userText) {
  // 서버로 보낼 최근 메시지(토큰 줄이기)
  const recentMessages = messages.slice(-30).map(m => ({
    from: m.from,
    text: m.text,
    ts: m.ts
  }));

  const payload = {
    userMessage: userText,
    messages: recentMessages,
    summary: summary
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${t}`);
  }

  const data = await res.json();
  return data;
}

function normalizeApiMessages(data) {
  // 기대 스키마: { messages: [ {from, text}, ... ] }
  const arr = data?.messages;
  if (!Array.isArray(arr)) return [];

  const cleaned = arr
    .map(x => ({
      from: typeof x?.from === "string" ? x.from.trim() : "",
      text: typeof x?.text === "string" ? x.text.trim() : ""
    }))
    .filter(x => FRIENDS.includes(x.from) && x.text);

  // 혹시 모델이 4명보다 많이 보내면 4개만
  return cleaned.slice(0, 4);
}

function applySummaryAppend(data) {
  // (선택) API가 summary_append 제공하면 요약에 누적
  const append = data?.summary_append;
  if (!Array.isArray(append) || !append.length) return;

  const lines = append
    .map(x => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);

  if (!lines.length) return;

  // 너무 길어지면 뒤쪽만 유지
  const merged = (summary ? summary + "\n" : "") + lines.map(l => `- ${l}`).join("\n");
  summary = merged.split("\n").slice(-40).join("\n"); // 마지막 40줄만 유지
  saveSummary(summary);
}

// ====== 전송 ======
async function handleSend() {
  const text = inputEl.value.trim();
  if (!text) return;

  addMessage("me", text);
  inputEl.value = "";
  inputEl.focus();

  // 서버 호출
  setSendingState(true);
  showTyping();

  try {
    const data = await fetchFriendsReply(text);
    const replyMsgs = normalizeApiMessages(data);

    if (!replyMsgs.length) {
      // 응답이 비어있으면 안전 처리
      renderSystem("응답이 비어 있어요. 다시 한 번 보내볼래?");
    } else {
      // 4명이 순서대로 오는 느낌으로 약간 딜레이
      replyMsgs.forEach((m, idx) => {
        setTimeout(() => addMessage(m.from, m.text), 250 * (idx + 1));
      });
    }

    applySummaryAppend(data);
  } catch (e) {
    renderSystem("서버 연결에 실패했어. Vercel 주소/API 상태를 확인해줘.");
    console.error(e);
  } finally {
    hideTyping();
    setSendingState(false);
  }
}

sendBtn.addEventListener("click", handleSend);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

// ====== 개발용 ======
window.resetChat = function () {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SUMMARY_KEY);
  messages = [];
  summary = "";
  renderAll(messages);
};
