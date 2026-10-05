'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./lib/db');
const ai = require('./lib/ai');

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const COOKIE_NAME = 'ainotes_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TEST_HOOKS = process.env.ENABLE_TEST_HOOKS !== '0';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

db.init();

function sign(email, exp) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`${email}.${exp}`).digest('base64url');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function createSessionCookie(email) {
  const exp = Date.now() + SESSION_TTL_MS;
  const encoded = Buffer.from(email).toString('base64url');
  const value = `${encoded}.${exp}.${sign(email, exp)}`;
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function readSession(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== COOKIE_NAME) continue;
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    const pieces = value.split('.');
    if (pieces.length !== 3) return null;
    const email = Buffer.from(pieces[0], 'base64url').toString();
    const exp = Number(pieces[1]);
    if (!email || !exp || Date.now() > exp) return null;
    if (!safeEqual(pieces[2], sign(email, exp))) return null;
    return email;
  }
  return null;
}

function sessionUser(req) {
  const email = readSession(req);
  return email ? db.findUserByEmail(email) : null;
}

function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function parseNoteInput(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body : '';
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 10)
    : [];
  return { title, body: text, tags };
}

app.get('/', (req, res) => {
  if (!sessionUser(req)) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.get('/login', (req, res) => {
  if (sessionUser(req)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const user = db.findUserByEmail(email);
  if (!user || !safeEqual(password, user.password)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  res.set('Set-Cookie', createSessionCookie(user.email));
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  res.set('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/notes', requireAuth, (req, res) => {
  let notes = db.listNotes(req.user.id);
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q) {
    notes = notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  const sort = ['updated', 'created', 'title'].includes(req.query.sort) ? req.query.sort : 'updated';
  const order = req.query.order === 'asc' ? 1 : -1;
  notes.sort((a, b) => {
    const av = sort === 'title' ? a.title.toLowerCase() : a[`${sort}At`];
    const bv = sort === 'title' ? b.title.toLowerCase() : b[`${sort}At`];
    return av < bv ? -order : av > bv ? order : 0;
  });
  res.json({ notes });
});

app.post('/api/notes', requireAuth, (req, res) => {
  const input = parseNoteInput(req.body || {});
  if (!input.title) return res.status(400).json({ error: 'title_required' });
  const note = db.createNote(req.user.id, input);
  res.status(201).json({ note });
});

app.get('/api/notes/:id', requireAuth, (req, res) => {
  const note = db.getNote(req.user.id, req.params.id);
  if (!note) return res.status(404).json({ error: 'not_found' });
  res.json({ note });
});

app.put('/api/notes/:id', requireAuth, (req, res) => {
  const input = parseNoteInput(req.body || {});
  if (!input.title) return res.status(400).json({ error: 'title_required' });
  const note = db.updateNote(req.user.id, req.params.id, input);
  if (!note) return res.status(404).json({ error: 'not_found' });
  res.json({ note });
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
  if (!db.deleteNote(req.user.id, req.params.id)) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json({ ok: true });
});

app.post('/api/notes/:id/summarize', requireAuth, async (req, res, next) => {
  try {
    const note = db.getNote(req.user.id, req.params.id);
    if (!note) return res.status(404).json({ error: 'not_found' });
    const result = await ai.summarize(note);
    if (result.error === 'invalid_ai_output') {
      return res.status(502).json({ error: 'invalid_ai_output', detail: 'AI provider returned unusable output' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

if (TEST_HOOKS) {
  app.post('/api/test/reset', (req, res) => {
    db.reset();
    ai.resetMode();
    res.json({ ok: true });
  });
  app.get('/api/test/seed', (req, res) => {
    res.json(db.seedData());
  });
  app.get('/api/test/ai-mode', (req, res) => {
    res.json(ai.getMode());
  });
  app.put('/api/test/ai-mode', (req, res) => {
    res.json(ai.setMode(req.body || {}));
  });
}

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`AI Notes listening on http://localhost:${PORT}`);
  console.log(`Login: demo@ainotes.app / password123`);
  console.log(`Test hooks: ${TEST_HOOKS ? 'enabled' : 'DISABLED'}`);
});
