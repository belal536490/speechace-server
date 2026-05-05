const express = require('express');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Decode key fully
function decodeKey(key) {
  key = (key || '').trim();
  let prev = '';
  while (prev !== key) {
    prev = key;
    try { key = decodeURIComponent(key); } catch(e) { break; }
  }
  return key.trim();
}

// Health check
app.get('/api/health', (req, res) => {
  const raw = process.env.SPEECHACE_KEY || '';
  const decoded = decodeKey(raw);
  res.json({
    status: 'ok',
    key_set: !!decoded,
    raw_length: raw.length,
    decoded_length: decoded.length,
    key_preview: decoded.substring(0, 20) + '...'
  });
});

// SpeechAce proxy
app.post('/api/speechace', upload.single('user_audio_file'), async (req, res) => {
  const raw = process.env.SPEECHACE_KEY || req.headers['x-speechace-key'] || '';
  const saKey = decodeKey(raw);

  console.log('Key length:', saKey.length, '| preview:', saKey.substring(0, 20));

  if (!saKey) return res.json({ status: 'error', message: 'SPEECHACE_KEY not set' });
  if (!req.file) return res.json({ status: 'error', message: 'No audio file' });

  const text = (req.body.text || 'hello').trim();
  console.log('Text:', text);

  // Try all 3 methods SpeechAce supports
  const methods = [
    // Method 1: key in URL query (standard)
    async () => {
      const fd = buildForm(req.file, text);
      const url = `https://api5.speechace.com/api/scoring/text/v9/json?key=${saKey}&dialect=en-us&user_id=u1`;
      return fetch(url, { method: 'POST', body: fd, headers: fd.getHeaders() });
    },
    // Method 2: key in URL encoded
    async () => {
      const fd = buildForm(req.file, text);
      const url = `https://api5.speechace.com/api/scoring/text/v9/json?key=${encodeURIComponent(saKey)}&dialect=en-us&user_id=u1`;
      return fetch(url, { method: 'POST', body: fd, headers: fd.getHeaders() });
    },
    // Method 3: key in form data
    async () => {
      const fd = buildForm(req.file, text);
      fd.append('key', saKey);
      const url = `https://api5.speechace.com/api/scoring/text/v9/json?dialect=en-us&user_id=u1`;
      return fetch(url, { method: 'POST', body: fd, headers: fd.getHeaders() });
    },
    // Method 4: original speechace.co domain
    async () => {
      const fd = buildForm(req.file, text);
      const url = `https://api.speechace.co/api/scoring/text/v9/json?key=${saKey}&dialect=en-us&user_id=u1`;
      return fetch(url, { method: 'POST', body: fd, headers: fd.getHeaders() });
    }
  ];

  for (let i = 0; i < methods.length; i++) {
    try {
      console.log(`Trying method ${i + 1}...`);
      const r = await methods[i]();
      const raw = await r.text();
      console.log(`Method ${i + 1} response:`, raw.substring(0, 200));
      
      let data;
      try { data = JSON.parse(raw); } catch(e) { continue; }
      
      if (data.status !== 'error' || data.short_message !== 'error_invalid_parameters') {
        console.log(`Method ${i + 1} SUCCESS`);
        return res.json(data);
      }
      console.log(`Method ${i + 1} failed: invalid parameters`);
    } catch(e) {
      console.log(`Method ${i + 1} exception:`, e.message);
    }
  }

  res.json({ status: 'error', message: 'All methods failed. Check SpeechAce dashboard for correct API endpoint and key format.' });
});

function buildForm(file, text) {
  const fd = new FormData();
  fd.append('user_audio_file', file.buffer, {
    filename: 'audio.wav',
    contentType: 'audio/wav'
  });
  fd.append('text', text);
  fd.append('question_info', 'u1/q1');
  return fd;
}

app.post('/api/config', (req, res) => res.json({ success: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
