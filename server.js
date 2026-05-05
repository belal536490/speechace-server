const express = require('express');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// SpeechAce proxy endpoint
app.post('/api/speechace', upload.single('user_audio_file'), async (req, res) => {
  const saKey = process.env.SPEECHACE_KEY || req.headers['x-speechace-key'] || '';
  if (!saKey) return res.json({ success: false, error: 'SpeechAce key নেই' });

  const text = req.body.text || 'hello';

  try {
    const fd = new FormData();
    fd.append('user_audio_file', req.file.buffer, {
      filename: 'audio.wav',
      contentType: req.file.mimetype,
    });
    fd.append('text', text);
    fd.append('question_info', 'u1/q1');

    const url = `https://api.speechace.co/api/scoring/text/v9/json?key=${saKey}&dialect=en-us&user_id=user1`;
    const r = await fetch(url, { method: 'POST', body: fd, headers: fd.getHeaders() });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Config save
app.post('/api/config', (req, res) => {
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
