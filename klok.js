const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Konfigurasi umum
const CONFIG = {
  API_BASE_URL: 'https://api1-pp.klokapp.ai/v1',
  CHAT_INTERVAL: 60000,
  RANDOM_MESSAGES: [
    "Hey there!",
    "What's new?",
    "How's it going?",
    "Tell me something interesting",
    "What do you think about AI?",
    "Have you heard the latest news?",
    "What's your favorite topic?",
    "Let's discuss something fun"
  ]
};

// Ambil semua token dari file tokens.txt
function getAllTokens() {
  try {
    const data = fs.readFileSync('tokens.txt', 'utf8');
    const tokens = data.split('\n').map(t => t.trim()).filter(Boolean);
    if (tokens.length === 0) throw new Error("File tokens.txt kosong");
    return tokens;
  } catch (err) {
    console.error('[!] Gagal membaca tokens.txt:', err.message);
    process.exit(1);
  }
}

// Buat client API dari token
function createApiClient(token) {
  return axios.create({
    baseURL: CONFIG.API_BASE_URL,
    headers: {
      'x-session-token': token,
      'user-agent': 'Mozilla/5.0',
      'accept': '*/*',
      'origin': 'https://klokapp.ai',
      'referer': 'https://klokapp.ai/'
    }
  });
}

// Ambil pesan random
function getRandomMessage() {
  const idx = Math.floor(Math.random() * CONFIG.RANDOM_MESSAGES.length);
  return CONFIG.RANDOM_MESSAGES[idx];
}

// Cek poin akun
async function checkPoints(apiClient, label) {
  try {
    const res = await apiClient.get('/points');
    const p = res.data;
    console.log(`[${label}] Points: ${p.points} | Referral: ${p.referral_points} | Total: ${p.total_points}`);
    return p;
  } catch (err) {
    console.error(`[${label}] Gagal cek poin:`, err.response?.data || err.message);
    return null;
  }
}

// Ambil thread
async function getThreads(apiClient, label) {
  try {
    const res = await apiClient.get('/threads');
    return res.data.data || [];
  } catch (err) {
    console.error(`[${label}] Gagal ambil thread:`, err.response?.data || err.message);
    return [];
  }
}

// Buat thread baru
async function createThread(apiClient, message, label) {
  const data = {
    title: "New Chat",
    messages: [{ role: "user", content: message }],
    sources: null,
    id: uuidv4(),
    dataset_id: "34a725bc-3374-4042-9c37-c2076a8e4c2b",
    created_at: new Date().toISOString()
  };

  try {
    const res = await apiClient.post('/threads', data);
    console.log(`[${label}] Thread baru dibuat: ${res.data.id}`);
    return res.data;
  } catch (err) {
    console.error(`[${label}] Gagal buat thread:`, err.response?.data || err.message);
    return null;
  }
}

// Kirim pesan ke thread
async function sendMessage(apiClient, threadId, message, label) {
  const data = {
    id: threadId,
    title: "New Chat",
    messages: [{ role: "user", content: message }],
    sources: [],
    model: "llama-3.3-70b-instruct",
    created_at: new Date().toISOString(),
    language: "english"
  };

  try {
    await apiClient.post('/chat', data);
    console.log(`[${label}] Pesan terkirim ke thread ${threadId}`);
    return true;
  } catch (err) {
    if (err.message.includes('stream has been aborted')) {
      console.log(`[${label}] Stream aborted, kemungkinan terkirim`);
      return true;
    }
    console.error(`[${label}] Gagal kirim pesan:`, err.response?.data || err.message);
    return false;
  }
}

// Jalankan bot per akun
async function runBotForToken(token, index) {
  const label = `Akun-${index + 1}`;
  const apiClient = createApiClient(token);

  let currentThreadId = null;

  await checkPoints(apiClient, label);

  const threads = await getThreads(apiClient, label);
  if (threads.length > 0) {
    currentThreadId = threads[0].id;
    console.log(`[${label}] Menggunakan thread lama: ${currentThreadId}`);
  } else {
    const newThread = await createThread(apiClient, "Mulai obrolan baru", label);
    if (newThread) currentThreadId = newThread.id;
  }

  setInterval(async () => {
    if (!currentThreadId) {
      const newThread = await createThread(apiClient, "Mulai obrolan baru", label);
      if (newThread) currentThreadId = newThread.id;
      else return;
    }

    const points = await checkPoints(apiClient, label);
    if (!points || points.total_points <= 0) {
      console.log(`[${label}] Tidak ada poin. Menunggu...`);
      return;
    }

    const msg = getRandomMessage();
    const sent = await sendMessage(apiClient, currentThreadId, msg, label);

    if (!sent) {
      currentThreadId = null;
    }
  }, CONFIG.CHAT_INTERVAL);
}

// Jalankan semua akun
async function startAllBots() {
  console.log('\n🚀 Menjalankan Klok Multi-Akun Bot\n');
  const tokens = getAllTokens();

  for (let i = 0; i < tokens.length; i++) {
    runBotForToken(tokens[i], i);
  }
}

startAllBots();
