const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

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

function loadAccounts() {
  try {
    const raw = fs.readFileSync('tokens.json', 'utf8');
    const accounts = JSON.parse(raw);

    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error("tokens.json kosong atau salah format");
    }

    for (const acc of accounts) {
      if (!acc.token || !acc.ai_id) {
        throw new Error("Setiap akun wajib punya 'token' dan 'ai_id'");
      }
    }

    return accounts;
  } catch (err) {
    console.error('[ERROR] Gagal membaca tokens.json:', err.message);
    process.exit(1);
  }
}

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

function getRandomMessage() {
  const i = Math.floor(Math.random() * CONFIG.RANDOM_MESSAGES.length);
  return CONFIG.RANDOM_MESSAGES[i];
}

async function checkPoints(client, label) {
  try {
    const res = await client.get('/points');
    const p = res.data;
    console.log(`[${label}] 🔹 Points: ${p.points} | Referral: ${p.referral_points} | Total: ${p.total_points}`);
    return p;
  } catch (err) {
    console.error(`[${label}] Gagal cek poin:`, err.response?.data || err.message);
    return null;
  }
}

async function getThreads(client, label) {
  try {
    const res = await client.get('/threads');
    return res.data.data || [];
  } catch (err) {
    console.error(`[${label}] Gagal ambil threads:`, err.response?.data || err.message);
    return [];
  }
}

async function createThread(client, message, label) {
  const data = {
    title: "New Chat",
    messages: [{ role: "user", content: message }],
    sources: null,
    id: uuidv4(),
    dataset_id: "34a725bc-3374-4042-9c37-c2076a8e4c2b",
    created_at: new Date().toISOString()
  };

  try {
    const res = await client.post('/threads', data);
    console.log(`[${label}] 🆕 Thread baru: ${res.data.id}`);
    return res.data;
  } catch (err) {
    console.error(`[${label}] Gagal buat thread:`, err.response?.data || err.message);
    return null;
  }
}

async function sendMessage(client, threadId, ai_id, message, label) {
  const data = {
    id: threadId,
    ai_id: ai_id,
    title: "New Chat",
    messages: [{ role: "user", content: message }],
    sources: [],
    model: "llama-3.3-70b-instruct",
    created_at: new Date().toISOString(),
    language: "english"
  };

  try {
    await client.post('/chat', data);
    console.log(`[${label}] ✅ Pesan terkirim ke thread ${threadId}`);
    return true;
  } catch (err) {
    if (err.message.includes('stream has been aborted')) {
      console.warn(`[${label}] Stream aborted, kemungkinan tetap terkirim`);
      return true;
    }
    console.error(`[${label}] Gagal kirim pesan:`, err.response?.data || err.message);
    return false;
  }
}

async function runBot({ token, ai_id }, index) {
  const label = `Akun-${index + 1}`;
  const client = createApiClient(token);
  let currentThreadId = null;

  await checkPoints(client, label);

  const threads = await getThreads(client, label);
  if (threads.length > 0) {
    currentThreadId = threads[0].id;
    console.log(`[${label}] Menggunakan thread lama: ${currentThreadId}`);
  } else {
    const newThread = await createThread(client, "Memulai percakapan baru", label);
    if (newThread) currentThreadId = newThread.id;
  }

  setInterval(async () => {
    if (!currentThreadId) {
      const newThread = await createThread(client, "Percakapan baru karena sebelumnya gagal", label);
      if (newThread) {
        currentThreadId = newThread.id;
      } else {
        return;
      }
    }

    const points = await checkPoints(client, label);
    if (!points || points.total_points <= 0) {
      console.log(`[${label}] ⏸ Tidak ada poin. Menunggu...`);
      return;
    }

    const message = getRandomMessage();
    const sent = await sendMessage(client, currentThreadId, ai_id, message, label);
    if (!sent) {
      currentThreadId = null;
    }
  }, CONFIG.CHAT_INTERVAL);
}

async function main() {
  console.log('\n🚀 Menjalankan KLOK Multi-Akun Bot...\n');
  const accounts = loadAccounts();

  accounts.forEach((account, index) => {
    runBot(account, index);
  });
}

main();
