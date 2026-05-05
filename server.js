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
  const key = process.env.SPEECHACE_KEY || '';
  res.json({
    status: 'ok',
    speechace_key_set: !!key,
    key_length: key.length,
    key_preview: key ? key.substring(0, 10) + '...' : 'NOT SET'
  });
});

// SpeechAce proxy
app.post('/api/speechace', upload.single('user_audio_file'), async (req, res) => {
  // Get key — try env first, then header
  let saKey = process.env.SPEECHACE_KEY || req.headers['x-speechace-key'] || '';

  // URL decode if needed
  try { saKey = decodeURIComponent(saKey); } catch(e) {}
  saKey = saKey.trim();

  console.log('SpeechAce call — key length:', saKey.length, '— text:', req.body.text);

  if (!saKey) {
    return res.json({ status: 'error', success: false, message: 'SPEECHACE_KEY not set in environment' });
  }

  if (!req.file) {
    return res.json({ status: 'error', success: false, message: 'No audio file received' });
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

    // Use api5 endpoint (AP South — matches your subscription)
    const url = `https://api5.speechace.com/api/scoring/text/v9/json?key=${encodeURIComponent(saKey)}&dialect=en-us&user_id=user1`;

    console.log('Calling SpeechAce URL:', url.substring(0, 80) + '...');

    const r = await fetch(url, {
      method: 'POST',
      body: fd,
      headers: { ...fd.getHeaders() },
      timeout: 30000
    });

    const raw = await r.text();
    console.log('SpeechAce raw response (first 200):', raw.substring(0, 200));

    let data;
    try { data = JSON.parse(raw); }
    catch(e) { return res.json({ status: 'error', success: false, message: 'SpeechAce non-JSON response: ' + raw.substring(0, 100) }); }

    res.json(data);

  } catch (e) {
    console.error('SpeechAce error:', e.message);
    res.json({ status: 'error', success: false, message: e.message });
  }
});

// Config test
app.post('/api/config', (req, res) => res.json({ success: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
