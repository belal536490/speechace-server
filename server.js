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

// Health check
app.get('/api/health', (req, res) => {
  let key = process.env.SPEECHACE_KEY || '';
  // Decode to check real length
  let decoded = key;
  let prev = '';
  while (prev !== decoded) {
    prev = decoded;
    try { decoded = decodeURIComponent(decoded); } catch(e) { break; }
  }
  res.json({
    status: 'ok',
    key_set: !!key,
    raw_length: key.length,
    decoded_length: decoded.length,
    key_preview: decoded.substring(0, 15) + '...'
  });
});

// SpeechAce proxy
app.post('/api/speechace', upload.single('user_audio_file'), async (req, res) => {
  let saKey = process.env.SPEECHACE_KEY || req.headers['x-speechace-key'] || '';

  // Fully decode — handle double/triple encoding
  let prev = '';
  while (prev !== saKey) {
    prev = saKey;
    try { saKey = decodeURIComponent(saKey); } catch(e) { break; }
  }
  saKey = saKey.trim();

  console.log('Key decoded length:', saKey.length, '| preview:', saKey.substring(0,15));
  console.log('Text:', req.body.text);

  if (!saKey) {
    return res.json({ status: 'error', message: 'SPEECHACE_KEY not set' });
  }
  if (!req.file) {
    return res.json({ status: 'error', message: 'No audio file received' });
  }

  const text = (req.body.text || 'hello').trim();

  try {
    const fd = new FormData();
    fd.append('user_audio_file', req.file.buffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav',
    });
    fd.append('text', text);
    fd.append('question_info', 'u1/q1');
    fd.append('include_unknown_words', '0');

    // API endpoint — AP South (your subscription region)
    const url = 'https://api5.speechace.com/api/scoring/text/v9/json?key='
      + encodeURIComponent(saKey)
      + '&dialect=en-us&user_id=user1';

    console.log('Calling SpeechAce...');

    const r = await fetch(url, {
      method: 'POST',
      body: fd,
      headers: { ...fd.getHeaders() }
    });

    const raw = await r.text();
    console.log('Response (200 chars):', raw.substring(0, 200));

    let data;
    try { data = JSON.parse(raw); }
    catch(e) {
      return res.json({ status: 'error', message: 'Bad response: ' + raw.substring(0, 150) });
    }

    res.json(data);

  } catch (e) {
    console.error('Fetch error:', e.message);
    res.json({ status: 'error', message: e.message });
  }
});

app.post('/api/config', (req, res) => res.json({ success: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
