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
  res.json({ status: 'ok', key_set: !!decoded, key_length: decoded.length, key_preview: decoded.substring(0,15)+'...' });
});

app.post('/api/speechace', upload.single('user_audio_file'), async (req, res) => {
  // Decode key fully
  const saKey = decodeKey(process.env.SPEECHACE_KEY || req.headers['x-speechace-key'] || '');
  const text = (req.body.text || 'hello').trim();

  console.log('Key length:', saKey.length, '| Text:', text);
  if (!saKey) return res.json({ status: 'error', message: 'SPEECHACE_KEY not set' });
  if (!req.file) return res.json({ status: 'error', message: 'No audio file received' });
  console.log('Audio:', req.file.size, 'bytes |', req.file.mimetype);

  try {
    // Build form — key in URL (per docs), audio + text in form
    const fd = new FormData();
    fd.append('text', text);
    fd.append('user_audio_file', req.file.buffer, {
      filename: 'audio.webm',
      contentType: req.file.mimetype || 'audio/webm',
      knownLength: req.file.size
    });

    // Key must be URL-encoded in query string (docs: key={{speechacekey}})
    const encodedKey = encodeURIComponent(saKey);
    const url = `https://api.speechace.co/api/scoring/text/v9/json?key=${encodedKey}&dialect=en-us&user_id=user1`;
    console.log('URL (first 80):', url.substring(0, 80));

    const r = await fetch(url, {
      method: 'POST',
      body: fd,
      headers: fd.getHeaders()
    });

    const raw = await r.text();
    console.log('SpeechAce response:', raw.substring(0, 300));

    let data;
    try { data = JSON.parse(raw); }
    catch(e) { return res.json({ status: 'error', message: 'Non-JSON: ' + raw.substring(0,100) }); }

    res.json(data);
  } catch(e) {
    console.error('Error:', e.message);
    res.json({ status: 'error', message: e.message });
  }
});

app.post('/api/config', (req, res) => res.json({ success: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
