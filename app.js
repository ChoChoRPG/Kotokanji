// ============================================
// 1. KONFIGURASI SUPABASE & AUTH
// ============================================
const SUPABASE_URL = "https://orryroqxvlqaiejaxnng.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycnlyb3F4dmxxYWllamF4bm5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyODczNDksImV4cCI6MjA3MTg2MzM0OX0.W1ncCBlqXxIsdAAzkeGHAcAhwDdnQfgSDT2jvXl_zOY";

let supabaseClient = null;
let currentUser = null;
let isCloudLoaded = false;

// Init Supabase
if (typeof supabase !== "undefined") {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  checkSession();
} else {
  console.error("Library Supabase gagal dimuat.");
}

// ============================================
// 2. VARIABEL GLOBAL APLIKASI (STATE)
// ============================================
const transCache = {};
let currentTab = "vocab";
let theme = localStorage.getItem("theme") || "light";

// --- STATE VOCAB ---
const vCanvas = document.getElementById("vocabCanvas");
const vCtx = vCanvas ? vCanvas.getContext("2d") : null;
let vList = [];
let vIndex = 0;
let vLevel = "";
let vFlip = false;
let vAnim = 0;
let vTarget = 0;
let vKnown = JSON.parse(localStorage.getItem("knownVocabMap")) || {};
let isRandomMode = false;
let isTTSOn = false;
let isFilterMode = false;
let isAutoMode = false;
let autoTimer = null;
let kanjiHitboxes = [];
let shuffledIndices = [];
let wakeLock = null;

// --- STATE KANJI ---
let kList = [];
let kKnown = JSON.parse(localStorage.getItem("knownKanjiMap")) || {};
let kCurrentChar = "";
const kGrid = document.getElementById("kanji-grid");

// ============================================
// 3. INIT TAMPILAN AWAL
// ============================================

// Set Tema
if (theme === "dark") document.body.setAttribute("data-theme", "dark");
updateThemeIcon();

// Setup Canvas Observer (Agar tidak pecah saat resize)
if (vCanvas) {
  const resizeObserver = new ResizeObserver(() => {
    resizeVocabCanvas();
  });
  const cardWrapper = document.getElementById("cardWrapper");
  if (cardWrapper) resizeObserver.observe(cardWrapper);

  // Event Click Canvas (Menggunakan fungsi yang didefinisikan di bawah)
  vCanvas.addEventListener("click", (e) => handleCanvasClick(e));
}

// Listener Enter pada Password Input
document.addEventListener("DOMContentLoaded", () => {
  const passwordInput = document.getElementById("auth-password");
  if (passwordInput) {
    passwordInput.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        handleLogin();
      }
    });
  }
});

// ============================================
// 4. FUNGSI AUTH & CLOUD (SUPABASE)
// ============================================

async function checkSession() {
  if (!supabaseClient) return;
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  handleSession(session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    handleSession(session);
  });
}

function handleSession(session) {
  if (session) {
    currentUser = session.user;
    updateAuthUI(true);
    updateUserGreeting();
    if (!isCloudLoaded) loadCloudProgress();
  } else {
    currentUser = null;
    updateAuthUI(false);
    updateUserGreeting();
    handleLocalClear();
    isCloudLoaded = false;
  }
}

async function loadCloudProgress() {
  if (!currentUser || !supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("user_progress")
    .select("*")
    .eq("user_id", currentUser.id)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error loading cloud data:", error);
    return;
  }

  if (data) {
    vKnown = data.vocab_data || {};
    kKnown = data.kanji_data || {};
    localStorage.setItem("knownVocabMap", JSON.stringify(vKnown));
    localStorage.setItem("knownKanjiMap", JSON.stringify(kKnown));
    console.log("Cloud data loaded & synced.");
  } else {
    console.log("No cloud data found. Initializing from local.");
    saveCloudProgress();
  }

  if (currentTab === "kanji") renderHeatmap();
  if (currentTab === "vocab") {
    updateVocabKnownBtn();
    drawCard();
  }

  isCloudLoaded = true;
}

async function saveCloudProgress() {
  if (!currentUser || !supabaseClient) return;

  const payload = {
    user_id: currentUser.id,
    vocab_data: vKnown || {},
    kanji_data: kKnown || {},
  };

  const { error } = await supabaseClient.from("user_progress").upsert(payload);

  if (error) {
    console.error("Failed to save progress:", error);
  }
}

// Fungsi Trigger Save: INSTANT TANPA DELAY
function triggerSave() {
  if (currentUser && supabaseClient && isCloudLoaded) {
    saveCloudProgress();
  }
}

function updateAuthUI(isLoggedIn) {
  const btn = document.getElementById("headerAuthBtn");
  if (!btn) return;
  if (isLoggedIn) {
    btn.innerText = "Logout";
    btn.classList.add("logged-in");
    btn.onclick = handleLogout;
  } else {
    btn.innerText = "Login";
    btn.classList.remove("logged-in");
    btn.onclick = openAuthModal;
  }
}

function updateUserGreeting() {
  const greetingEl = document.getElementById("user-greeting");
  if (!greetingEl) return;

  if (currentUser && currentUser.email) {
    let rawId = currentUser.email.split("@")[0];
    if (rawId.startsWith("u")) rawId = rawId.substring(1);
    const displayName = rawId.charAt(0).toUpperCase() + rawId.slice(1);
    greetingEl.innerText = `Selamat belajar ${displayName}!!`;
    greetingEl.style.display = "block";
  } else {
    greetingEl.style.display = "none";
  }
}

function openAuthModal() {
  document.getElementById("auth-modal").classList.add("show");
}
function closeAuthModal() {
  document.getElementById("auth-modal").classList.remove("show");
  document.getElementById("auth-msg").innerText = "";
}

function handleForgot() {
  const msg = document.getElementById("auth-msg");
  msg.style.color = "var(--text)";
  msg.innerHTML = "Hubungi Admin (Riyan) untuk meminta password Anda.";
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById("auth-password");
  const type =
    passwordInput.getAttribute("type") === "password" ? "text" : "password";
  passwordInput.setAttribute("type", type);
}

async function handleLogin() {
  const username = document.getElementById("auth-username").value;
  const password = document.getElementById("auth-password").value;
  const msg = document.getElementById("auth-msg");

  if (!username || !password) {
    msg.innerText = "Mohon isi ID dan Password";
    return;
  }

  const cleanUsername = username.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (cleanUsername.length < 3) {
    msg.innerText = "ID minimal 3 karakter";
    return;
  }
  const email = "u" + cleanUsername + "@cho.app";

  msg.innerText = "Sedang masuk...";
  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    msg.innerText = error.message.includes("confirmed")
      ? "Error: Konfirmasi Email aktif (Hubungi Admin)"
      : "ID/Password Salah";
  } else {
    closeAuthModal();
  }
}

async function handleSignup() {
  const username = document.getElementById("auth-username").value;
  const password = document.getElementById("auth-password").value;
  const msg = document.getElementById("auth-msg");

  if (!username || !password) {
    msg.innerText = "Mohon isi ID dan Password";
    return;
  }

  const cleanUsername = username.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (cleanUsername.length < 3) {
    msg.innerText = "ID minimal 3 karakter";
    return;
  }
  const email = "u" + cleanUsername + "@cho.app";

  msg.innerText = "Mendaftar...";
  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    msg.innerText = "Gagal: " + error.message;
  } else {
    if (data.user) {
      supabaseClient
        .from("user_secrets")
        .insert({
          user_id: data.user.id,
          username: username,
          password_hint: password,
        })
        .then(() => {});
    }
    msg.innerText = "Berhasil! Silakan Login.";
  }
}

async function handleLogout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  alert("Berhasil Logout.");
}

function handleLocalClear() {
  vKnown = {};
  kKnown = {};
  localStorage.removeItem("knownVocabMap");
  localStorage.removeItem("knownKanjiMap");
  updateVocabKnownBtn();
  if (vCanvas) drawCard();
  if (currentTab === "kanji") renderHeatmap();
}

// ============================================
// 5. LOGIKA KANJI
// ============================================

async function loadKanjiData(level) {
  document.querySelectorAll("#kanji-levels .lvl-btn").forEach((b) => {
    b.classList.remove("active");
    if (b.innerText.toLowerCase() === level) b.classList.add("active");
  });

  if (!kGrid) {
    console.error("Grid Kanji tidak ditemukan!");
    return;
  }

  kGrid.innerHTML =
    '<div style="grid-column:1/-1; text-align:center; padding:20px;"><div class="loader"></div> Memuat Data...</div>';

  const suffix = level.replace("n", "");
  const urlUser = `https://kanjiapi.dev/v1/kanji/jlpt-${suffix}`;
  const urlStd = `https://kanjiapi.dev/v1/kanji/jlpt/${level}`;

  try {
    let res = await fetch(urlUser);
    if (!res.ok) res = await fetch(urlStd);
    if (!res.ok) throw new Error("Gagal memuat data Kanji");

    kList = await res.json();
    renderHeatmap();
  } catch (e) {
    kGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:red;">Gagal koneksi ke server Kanji.</div>`;
  }
}

function renderHeatmap() {
  if (!kGrid) return;
  kGrid.innerHTML = "";
  let count = 0;

  if (!kList || kList.length === 0) return;

  kList.forEach((char) => {
    const div = document.createElement("div");
    div.className = "k-box";
    div.innerText = char;
    div.id = `k-${char}`;

    if (kKnown[char]) {
      div.classList.add("known");
      count++;
    }

    div.onclick = () => openModal(char);
    div.oncontextmenu = (e) => {
      e.preventDefault();
      toggleKanji(char);
    };

    kGrid.appendChild(div);
  });
  updateStats(count);
}

function toggleKanji(char) {
  if (kKnown[char]) delete kKnown[char];
  else kKnown[char] = true;

  localStorage.setItem("knownKanjiMap", JSON.stringify(kKnown));
  triggerSave();

  if (currentTab === "kanji")
    updateStats(Object.keys(kKnown).filter((k) => kList.includes(k)).length);
  if (kCurrentChar === char) updateModalBtn();

  const el = document.getElementById(`k-${char}`);
  if (el) {
    if (kKnown[char]) el.classList.add("known");
    else el.classList.remove("known");
  }
}

function updateStats(n) {
  const countEl = document.getElementById("k-count");
  const totalEl = document.getElementById("k-total");
  const progEl = document.getElementById("k-progress");

  if (countEl) countEl.innerText = n;
  if (totalEl) totalEl.innerText = kList.length;
  if (progEl) {
    const pct = kList.length ? (n / kList.length) * 100 : 0;
    progEl.style.width = pct + "%";
  }
}

async function openModal(char) {
  if (isAutoMode) stopAutoPlay();
  kCurrentChar = char;
  const m = document.getElementById("modal");
  m.classList.add("show");

  document.getElementById("m-char").innerText = char;
  document.getElementById("m-mean").innerText = "...";
  document.getElementById("m-mean-en").innerText = "";
  document.getElementById("m-kun").innerHTML = "-";
  document.getElementById("m-on").innerHTML = "-";

  updateModalBtn();

  try {
    const r = await fetch(`https://kanjiapi.dev/v1/kanji/${char}`);
    const d = await r.json();

    if (d.kun_readings.length > 0) {
      document.getElementById("m-kun").innerHTML = d.kun_readings
        .map((r) => `<div class="reading-item">${r}</div>`)
        .join("");
    }
    if (d.on_readings.length > 0) {
      document.getElementById("m-on").innerHTML = d.on_readings
        .map((r) => `<div class="reading-item">${r}</div>`)
        .join("");
    }

    const eng = d.meanings.slice(0, 3).join(", ");
    document.getElementById("m-mean-en").innerText = eng;

    const indo = await translateText(eng);
    document.getElementById("m-mean").innerText = indo || eng;
  } catch {
    document.getElementById("m-mean").innerText = "Gagal memuat info";
  }
}

function closeModal() {
  document.getElementById("modal").classList.remove("show");
}
function updateModalBtn() {
  const btn = document.getElementById("m-btn");
  if (kKnown[kCurrentChar]) {
    btn.innerText = "Sudah Hafal (Batal)";
    btn.classList.add("is-known");
  } else {
    btn.innerText = "Tandai Sudah Hafal";
    btn.classList.remove("is-known");
  }
}
function toggleKnownFromModal() {
  toggleKanji(kCurrentChar);
}

// ============================================
// 6. LOGIKA VOCAB & CANVAS
// ============================================

function toggleTheme() {
  theme = theme === "light" ? "dark" : "light";
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  updateThemeIcon();
  if (currentTab === "vocab") resizeVocabCanvas();
}

function updateThemeIcon() {
  const btn = document.getElementById("themeBtn");
  if (theme === "dark") {
    btn.innerHTML =
      '<img src="img/sun.svg" alt="Light" class="theme-icon-img">';
  } else {
    btn.innerHTML =
      '<img src="img/moon.svg" alt="Dark" class="theme-icon-img">';
  }
}

function setTab(tab) {
  currentTab = tab;
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  event.target.classList.add("active");
  document
    .querySelectorAll(".section")
    .forEach((s) => s.classList.remove("active"));
  if (tab === "vocab") {
    document.getElementById("vocab-section").classList.add("active");
    setTimeout(resizeVocabCanvas, 50);
  } else {
    document.getElementById("kanji-section").classList.add("active");
  }
}

function resizeVocabCanvas() {
  if (!vCanvas || !vCanvas.parentElement) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = vCanvas.parentElement.getBoundingClientRect();
  vCanvas.width = rect.width * dpr;
  vCanvas.height = rect.height * dpr;
  vCtx.setTransform(1, 0, 0, 1, 0, 0);
  vCtx.scale(dpr, dpr);
  vCanvas.logicalW = rect.width;
  vCanvas.logicalH = rect.height;
  if (vList.length > 0) drawCard();
}

async function loadVocab(lvl) {
  const status = document.getElementById("vocab-msg");
  const area = document.getElementById("vocab-canvas-area");
  stopAutoPlay();
  document.querySelectorAll("#vocab-levels .lvl-btn").forEach((b) => {
    b.classList.remove("active");
    if (b.innerText.toLowerCase() === lvl) b.classList.add("active");
  });
  if (area) area.style.display = "none";
  status.innerHTML = '<div class="loader"></div> Memuat JSON...';
  try {
    const res = await fetch(`data/${lvl}.json`);
    if (!res.ok) throw new Error("Gagal load file JSON.");
    const data = await res.json();
    if (data.words) {
      vList = data.words;
      vLevel = lvl.toUpperCase();
      vIndex = 0;
      vFlip = false;
      vTarget = 0;
      vAnim = 0;
      isFilterMode = false;
      updateFilterBtn();
      initIndices();
      if (area) area.style.display = "block";
      updateStatusMsg();
      updateVocabKnownBtn();
      resizeVocabCanvas();
      if (getCurrentIndex() !== -1) translateMeaning(getCurrentIndex());
    }
  } catch (e) {
    status.innerHTML = `<span style="color:red">${e.message}</span>`;
  }
}

function initIndices() {
  let tempIndices = [];
  for (let i = 0; i < vList.length; i++) {
    if (isFilterMode) {
      if (!vKnown[vList[i].word]) tempIndices.push(i);
    } else {
      tempIndices.push(i);
    }
  }
  shuffledIndices = tempIndices;
  if (isRandomMode) shuffleArray(shuffledIndices);
  vIndex = 0;
  updateStatusMsg();
}

function getCurrentIndex() {
  if (shuffledIndices.length === 0) return -1;
  return shuffledIndices[vIndex];
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function updateStatusMsg() {
  const status = document.getElementById("vocab-msg");
  const remain = shuffledIndices.length;
  const total = vList.length;
  let text = `Level ${vLevel}: Total ${total} kata.`;
  if (isFilterMode) text += ` (Filter Aktif: ${remain} kata)`;
  status.innerText = text;
  status.style.color = "#27ae60";
}

// FUNGSI HELPER UNTUK DRAW ROUNDED RECT (MANUAL) AGAR AMAN DI SEMUA BROWSER
CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  this.beginPath();
  this.moveTo(x + r, y);
  this.arcTo(x + w, y, x + w, y + h, r);
  this.arcTo(x + w, y + h, x, y + h, r);
  this.arcTo(x, y + h, x, y, r);
  this.arcTo(x, y, x + w, y, r);
  this.closePath();
  return this;
};

function drawCard() {
  const w = vCanvas.logicalW;
  const h = vCanvas.logicalH;
  vCtx.clearRect(0, 0, w, h);

  const isDark = document.body.getAttribute("data-theme") === "dark";
  const textCol = isDark ? "#f5f6fa" : "#2d3436";

  const grad = vCtx.createLinearGradient(0, 0, 0, h);
  if (isDark) {
    grad.addColorStop(0, "#333");
    grad.addColorStop(1, "#2a2a2a");
  } else {
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#f4f4f4");
  }

  if (shuffledIndices.length === 0) {
    vCtx.font = "bold 1.2rem Arial";
    vCtx.fillStyle = textCol;
    vCtx.textAlign = "center";
    vCtx.fillText(
      isFilterMode ? "Semua kata sudah dihafal!" : "Tidak ada data.",
      w / 2,
      h / 2
    );
    return;
  }
  const dataIdx = getCurrentIndex();
  const item = vList[dataIdx];

  if (Math.abs(vTarget - vAnim) > 0.01) {
    vAnim += (vTarget - vAnim) * 0.2;
    requestAnimationFrame(drawCard);
  } else {
    vAnim = vTarget;
  }
  let scaleX = 1;
  let isBack = false;
  if (vAnim <= 0.5) {
    scaleX = 1 - vAnim * 2;
    isBack = false;
  } else {
    scaleX = (vAnim - 0.5) * 2;
    isBack = true;
  }

  vCtx.save();
  vCtx.translate(w / 2, h / 2);
  vCtx.scale(scaleX, 1);
  vCtx.translate(-w / 2, -h / 2);

  // Gunakan fallback roundRect custom
  vCtx.roundRect(0, 0, w, h, 24);

  vCtx.fillStyle = grad;
  vCtx.fill();
  vCtx.lineWidth = isBack ? 3 : 1.5;
  vCtx.strokeStyle = isBack ? "#ff7675" : isDark ? "#555" : "#ddd";
  vCtx.stroke();
  vCtx.textAlign = "center";
  vCtx.textBaseline = "middle";

  if (!isBack) {
    // DEPAN
    const text = item.word;
    let fontSize = w < 350 ? 50 : 70;
    vCtx.font = `bold ${fontSize}px "Noto Sans JP", sans-serif`;
    let totalTextWidth = 0;
    for (let char of text) {
      totalTextWidth += vCtx.measureText(char).width;
    }
    const maxW = w - 80;
    if (totalTextWidth > maxW) {
      const scaleFactor = maxW / totalTextWidth;
      fontSize = Math.floor(fontSize * scaleFactor);
      vCtx.font = `bold ${fontSize}px "Noto Sans JP", sans-serif`;
      totalTextWidth = 0;
      for (let char of text) {
        totalTextWidth += vCtx.measureText(char).width;
      }
    }

    let startX = (w - totalTextWidth) / 2;
    let startY = h / 2;
    kanjiHitboxes = [];

    vCtx.shadowColor = "rgba(0,0,0,0.05)";
    vCtx.shadowBlur = 5;
    vCtx.shadowOffsetY = 2;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charW = vCtx.measureText(char).width;
      const isKanji = char.match(/[\u4e00-\u9faf]/);
      if (isKanji) {
        vCtx.fillStyle = "#ff7675";
        kanjiHitboxes.push({
          char,
          x: startX,
          y: startY - fontSize / 2,
          w: charW,
          h: fontSize,
        });
      } else {
        vCtx.fillStyle = textCol;
      }
      vCtx.textAlign = "left";
      vCtx.fillText(char, startX, startY);
      vCtx.textAlign = "center";
      startX += charW;
    }
    vCtx.shadowColor = "transparent";
    vCtx.fillStyle = isDark ? "#888" : "#bbb";
    vCtx.font = "bold 1rem sans-serif";
    vCtx.textAlign = "left";
    vCtx.fillText(vLevel, 30, 40);
    vCtx.textAlign = "right";
    vCtx.fillText(`${vIndex + 1} / ${shuffledIndices.length}`, w - 30, 40);
    if (vKnown[item.word]) {
      vCtx.fillStyle = "#55efc4";
      vCtx.font = "bold 2rem Arial";
      vCtx.fillText("✔", w - 40, h - 40);
    }
  } else {
    // BELAKANG (Updated Layout)
    vCtx.textAlign = "center";
    vCtx.fillStyle = textCol;
    vCtx.shadowColor = isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.05)";
    vCtx.shadowBlur = 3;

    // 1. Jepang
    vCtx.font = "bold 2.2rem 'Noto Sans JP', sans-serif";
    vCtx.fillText(item.furigana || item.word, w / 2, h * 0.2);
    vCtx.shadowColor = "transparent";

    // 2. Romaji
    vCtx.fillStyle = isDark ? "#aaa" : "#888";
    vCtx.font = "16px sans-serif";
    const roma = (item.romaji || "").toUpperCase();
    vCtx.fillText(roma, w / 2, h * 0.35);

    // 3. Divider (Full Width - 20px padding)
    vCtx.beginPath();
    vCtx.moveTo(20, h * 0.43);
    vCtx.lineTo(w - 20, h * 0.43);
    vCtx.strokeStyle = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
    vCtx.lineWidth = 2;
    vCtx.lineCap = "round";
    vCtx.stroke();

    // 4. Inggris
    vCtx.fillStyle = isDark ? "#888" : "#999";
    vCtx.font = "italic 16px sans-serif";
    const engMeaning = item.meaning || "";
    let engY = h * 0.53;
    const engWords = engMeaning.split(" ");
    let engLine = "";
    for (let n = 0; n < engWords.length; n++) {
      let testLine = engLine + engWords[n] + " ";
      if (vCtx.measureText(testLine).width > w * 0.85 && n > 0) {
        vCtx.fillText(engLine, w / 2, engY);
        engLine = engWords[n] + " ";
        engY += 22;
      } else {
        engLine = testLine;
      }
    }
    vCtx.fillText(engLine, w / 2, engY);

    // 5. Indonesia
    vCtx.fillStyle = "#ff7675";
    let indoFontSize = 22;
    if (w < 350) indoFontSize = 19;
    vCtx.font = `bold ${indoFontSize}px sans-serif`;
    const indoMeaning = item.meaning_id || "...";
    let indoY = engY + 35;
    const indoWords = indoMeaning.split(" ");
    let indoLine = "";
    for (let n = 0; n < indoWords.length; n++) {
      let testLine = indoLine + indoWords[n] + " ";
      if (vCtx.measureText(testLine).width > w * 0.85 && n > 0) {
        vCtx.fillText(indoLine, w / 2, indoY);
        indoLine = indoWords[n] + " ";
        indoY += indoFontSize + 6;
      } else {
        indoLine = testLine;
      }
    }
    vCtx.fillText(indoLine, w / 2, indoY);
  }
  vCtx.restore();
}

// === FUNGSI UTAMA HANDLER INTERAKSI (YANG TADI HILANG) ===
function handleCanvasClick(e) {
  if (shuffledIndices.length === 0) return;
  const rect = vCanvas.getBoundingClientRect();
  const scaleX = vCanvas.logicalW / rect.width;
  const scaleY = vCanvas.logicalH / rect.height;
  const clickX = (e.clientX - rect.left) * scaleX;
  const clickY = (e.clientY - rect.top) * scaleY;

  // Cek jika klik pada Kanji (untuk detail)
  if (!vFlip) {
    for (let box of kanjiHitboxes) {
      if (
        clickX >= box.x &&
        clickX <= box.x + box.w &&
        clickY >= box.y &&
        clickY <= box.y + box.h
      ) {
        if (isAutoMode) stopAutoPlay();
        openModal(box.char);
        return;
      }
    }
  }

  // Default: Balik Kartu
  if (isAutoMode) stopAutoPlay();
  flipCard();
}

function flipCard() {
  vFlip = !vFlip;
  vTarget = vFlip ? 1 : 0;
  drawCard();
  if (vFlip && (isTTSOn || isAutoMode)) speakDefinition();
  else window.speechSynthesis.cancel();
}

function nextCard() {
  if (isAutoMode) stopAutoPlay();
  if (vIndex < shuffledIndices.length - 1) {
    vIndex++;
    resetCard();
  }
}
function prevCard() {
  if (isAutoMode) stopAutoPlay();
  if (vIndex > 0) {
    vIndex--;
    resetCard();
  }
}

function toggleRandom() {
  stopAutoPlay();
  isRandomMode = !isRandomMode;
  const btn = document.getElementById("btn-random");
  if (isRandomMode) {
    btn.classList.add("active-toggle");
    shuffleArray(shuffledIndices);
  } else {
    btn.classList.remove("active-toggle");
    shuffledIndices.sort((a, b) => a - b);
  }
  vIndex = 0;
  resetCard();
}

function toggleFilter() {
  stopAutoPlay();
  isFilterMode = !isFilterMode;
  updateFilterBtn();
  initIndices();
  resetCard();
}
function updateFilterBtn() {
  const btn = document.getElementById("btn-filter");
  if (isFilterMode) btn.classList.add("filter-active");
  else btn.classList.remove("filter-active");
}

function resetCard() {
  window.speechSynthesis.cancel();
  vFlip = false;
  vTarget = 0;
  vAnim = 0;
  updateVocabKnownBtn();
  drawCard();
  translateMeaning(getCurrentIndex());
}

function toggleTTS() {
  isTTSOn = !isTTSOn;
  const btn = document.getElementById("btn-tts");
  if (isTTSOn) btn.classList.add("tts-active");
  else btn.classList.remove("tts-active");
}

function speakDefinition(onComplete) {
  const idx = getCurrentIndex();
  if (idx === -1 || !vList[idx]) {
    if (onComplete) onComplete();
    return;
  }
  window.speechSynthesis.cancel();
  const item = vList[idx];
  const jpText = item.furigana || item.word;
  const idText = item.meaning_id || item.meaning;
  const uJP = new SpeechSynthesisUtterance(jpText);
  uJP.lang = "ja-JP";
  uJP.rate = 0.8;
  const uID = new SpeechSynthesisUtterance(idText);
  uID.lang = "id-ID";
  uID.rate = 0.9;

  // Silent Audio Hack for Mobile
  const silence = new Audio(
    "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA=="
  );
  silence.play().catch(() => {});

  uJP.onend = () => {
    if (!isAutoMode && !isTTSOn) return;
    setTimeout(() => {
      window.speechSynthesis.speak(uID);
    }, 300);
  };
  uID.onend = () => {
    if (onComplete) onComplete();
  };
  window.speechSynthesis.speak(uJP);
}

function openAutoSettings() {
  if (isAutoMode) {
    stopAutoPlay();
    return;
  }
  document.getElementById("auto-modal").classList.add("show");
}
function closeAutoSettings() {
  document.getElementById("auto-modal").classList.remove("show");
}

function startAutoPlay() {
  closeAutoSettings();
  const speed = parseInt(document.getElementById("speed-range").value) * 1000;
  isAutoMode = true;
  document.getElementById("btn-auto").classList.add("auto-active");
  document.getElementById("btn-auto").innerHTML =
    '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
  requestWakeLock();
  runAutoSequence(speed);
}

function stopAutoPlay() {
  isAutoMode = false;
  clearTimeout(autoTimer);
  window.speechSynthesis.cancel();
  document.getElementById("btn-auto").classList.remove("auto-active");
  document.getElementById("btn-auto").innerHTML =
    '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  releaseWakeLock();
}

function runAutoSequence(speed) {
  if (!isAutoMode) return;
  autoTimer = setTimeout(() => {
    if (!isAutoMode) return;
    vFlip = true;
    vTarget = 1;
    drawCard();
    speakDefinition(() => {
      setTimeout(() => {
        if (!isAutoMode) return;
        if (vIndex < shuffledIndices.length - 1) {
          vIndex++;
          vFlip = false;
          vTarget = 0;
          vAnim = 0;
          updateVocabKnownBtn();
          drawCard();
          translateMeaning(getCurrentIndex());
          runAutoSequence(speed);
        } else {
          stopAutoPlay();
        }
      }, 1000);
    });
  }, speed);
}

function toggleVocabKnown() {
  const idx = getCurrentIndex();
  if (idx === -1) return;
  const word = vList[idx].word;
  if (vKnown[word]) delete vKnown[word];
  else vKnown[word] = true;
  localStorage.setItem("knownVocabMap", JSON.stringify(vKnown));
  triggerSave();
  if (isFilterMode && vKnown[word]) {
    shuffledIndices.splice(vIndex, 1);
    if (vIndex >= shuffledIndices.length)
      vIndex = Math.max(0, shuffledIndices.length - 1);
    updateStatusMsg();
  }
  updateVocabKnownBtn();
  drawCard();
}

function updateVocabKnownBtn() {
  const btn = document.getElementById("btn-vocab-known");
  const idx = getCurrentIndex();
  if (idx === -1) return;
  const word = vList[idx].word;
  if (vKnown[word]) {
    btn.innerText = "Batal Hafal";
    btn.classList.add("is-known");
  } else {
    btn.innerText = "Tandai Sudah Hafal";
    btn.classList.remove("is-known");
  }
}

function openKnownList() {
  if (isAutoMode) stopAutoPlay();
  const listContent = document.getElementById("known-list-content");
  listContent.innerHTML = "";
  const knownItems = vList.filter((item) => vKnown[item.word]);
  if (knownItems.length === 0) {
    listContent.innerHTML =
      '<div style="text-align:center; padding:20px; opacity:0.6;">Belum ada kata yang ditandai hafal di level ini.</div>';
  } else {
    knownItems.forEach((item) => {
      const div = document.createElement("div");
      div.className = "known-list-item";
      div.innerHTML = `
                <div class="k-word-col">
                    <div class="k-word">${item.word}</div>
                    <div class="k-furi">(${item.furigana || ""})</div>
                    <div class="k-mean">${item.meaning_id || item.meaning}</div>
                </div>
                <button class="del-btn" onclick="removeKnown('${
                  item.word
                }')">×</button>
            `;
      listContent.appendChild(div);
    });
  }
  document.getElementById("list-modal").classList.add("show");
}

function removeKnown(word) {
  if (vKnown[word]) {
    delete vKnown[word];
    localStorage.setItem("knownVocabMap", JSON.stringify(vKnown));
    triggerSave();
    openKnownList();
    const idx = getCurrentIndex();
    if (idx !== -1 && vList[idx].word === word) {
      updateVocabKnownBtn();
      drawCard();
    }
    if (isFilterMode) {
      initIndices();
      resetCard();
    }
  }
}
function closeListModal() {
  document.getElementById("list-modal").classList.remove("show");
}

async function translateText(txt) {
  if (!txt) return "";
  if (transCache[txt]) return transCache[txt];
  try {
    const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=id&dt=t&q=${encodeURI(
      txt
    )}`;
    const r = await fetch(u);
    const d = await r.json();
    const res = d[0].map((x) => x[0]).join("");
    const final = res.charAt(0).toUpperCase() + res.slice(1);
    transCache[txt] = final;
    return final;
  } catch {
    return null;
  }
}

async function translateMeaning(idx) {
  const realIdx = getCurrentIndex();
  if (realIdx === -1) return;
  const item = vList[realIdx];
  if (!item || item.meaning_id) return;
  const m = await translateText(item.meaning);
  item.meaning_id = m || item.meaning;
  if (realIdx === getCurrentIndex()) drawCard();
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator)
      wakeLock = await navigator.wakeLock.request("screen");
  } catch (err) {
    console.error(err);
  }
}
async function releaseWakeLock() {
  if (wakeLock !== null) {
    await wakeLock.release();
    wakeLock = null;
  }
}

document.addEventListener("keydown", (e) => {
  const isTyping =
    document.activeElement.tagName === "INPUT" ||
    document.activeElement.tagName === "TEXTAREA";
  if (currentTab === "vocab" && !isTyping) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      flipCard();
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextCard();
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prevCard();
    }
  }
});

// LOAD AWAL
resizeVocabCanvas();
