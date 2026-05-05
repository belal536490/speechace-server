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

function decodeKey(key) {
  key = (key || '').trim();
  let prev = '';
  while (prev !== key) { prev = key; try { key = decodeURIComponent(key); } catch(e) { break; } }
  return key.trim();
}

app.get('/api/health', (req, res) => {
  const decoded = decodeKey(process.env.SPEECHACE_KEY || '');
  res.json({ status: 'ok', key_set: !!decoded, key_length: decoded.length });
});

app.post('/api/speechace', upload.single('user_audio_file'), async (req, res) => {
  const saKey = decodeKey(process.env.SPEECHACE_KEY || req.headers['x-speechace-key'] || '');
  console.log('Key length:', saKey.length);

  if (!saKey) return res.json({ status: 'error', message: 'SPEECHACE_KEY not set' });
  if (!req.file) return res.json({ status: 'error', message: 'No audio file received' });

  const text = (req.body.text || 'hello').trim();
  console.log('Text:', text, '| Audio size:', req.file.size, 'bytes | Type:', req.file.mimetype);

  try {
    const fd = new FormData();
    // Key in form data (Method 3 worked)
    fd.append('key', saKey);
    fd.append('text', text);
    fd.append('question_info', 'u1/q1');
    fd.append('include_unknown_words', '0');
    // Audio file — try wav format
    fd.append('user_audio_file', req.file.buffer, {
      filename: 'recording.wav',
      contentType: 'audio/wav',
      knownLength: req.file.size
    });

    const url = 'https://api5.speechace.com/api/scoring/text/v9/json?dialect=en-us&user_id=user1';
    console.log('Calling:', url);

    const r = await fetch(url, { method: 'POST', body: fd, headers: fd.getHeaders() });
    const raw = await r.text();
    console.log('Response:', raw.substring(0, 300));

    let data;
    try { data = JSON.parse(raw); } catch(e) {
      return res.json({ status: 'error', message: 'Non-JSON response: ' + raw.substring(0, 100) });
    }
    res.json(data);
  } catch(e) {
    console.error('Error:', e.message);
    res.json({ status: 'error', message: e.message });
  }
});

app.post('/api/config', (req, res) => res.json({ success: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
