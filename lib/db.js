'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.json');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');

let state = null;

function readSeed() {
  return JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
}

function init() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(readSeed(), null, 2));
  }
  state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function reset() {
  state = readSeed();
  save();
}

function seedData() {
  return readSeed();
}

function findUserByEmail(email) {
  return state.users.find((u) => u.email === email) || null;
}

function listNotes(userId) {
  return state.notes.filter((n) => n.userId === userId);
}

function getNote(userId, id) {
  return state.notes.find((n) => n.id === id && n.userId === userId) || null;
}

function createNote(userId, { title, body, tags }) {
  const now = new Date().toISOString();
  const note = {
    id: `note_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
    userId,
    title,
    body,
    tags,
    createdAt: now,
    updatedAt: now,
  };
  state.notes.push(note);
  save();
  return note;
}

function updateNote(userId, id, { title, body, tags }) {
  const note = getNote(userId, id);
  if (!note) return null;
  note.title = title;
  note.body = body;
  note.tags = tags;
  note.updatedAt = new Date().toISOString();
  save();
  return note;
}

function deleteNote(userId, id) {
  const index = state.notes.findIndex((n) => n.id === id && n.userId === userId);
  if (index === -1) return false;
  state.notes.splice(index, 1);
  save();
  return true;
}

module.exports = {
  init,
  reset,
  seedData,
  findUserByEmail,
  listNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
};
