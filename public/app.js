'use strict';

const state = {
  notes: [],
  editingId: null,
  pendingDelete: new Map(),
};

const els = {
  userEmail: document.querySelector('[data-testid="user-email"]'),
  logout: document.querySelector('[data-testid="logout-button"]'),
  form: document.querySelector('[data-testid="note-form"]'),
  formHeading: document.querySelector('[data-testid="form-heading"]'),
  title: document.querySelector('[data-testid="note-title-input"]'),
  body: document.querySelector('[data-testid="note-body-input"]'),
  tags: document.querySelector('[data-testid="note-tags-input"]'),
  save: document.querySelector('[data-testid="note-save-button"]'),
  cancelEdit: document.querySelector('[data-testid="cancel-edit-button"]'),
  search: document.querySelector('[data-testid="search-input"]'),
  sort: document.querySelector('[data-testid="sort-select"]'),
  list: document.querySelector('[data-testid="notes-list"]'),
  empty: document.querySelector('[data-testid="notes-empty"]'),
  summaryPanel: document.querySelector('[data-testid="summary-panel"]'),
  summaryLoading: document.querySelector('[data-testid="summary-loading"]'),
  summaryText: document.querySelector('[data-testid="summary-text"]'),
  summaryVerified: document.querySelector('[data-testid="summary-verified"]'),
  summaryWarning: document.querySelector('[data-testid="summary-warning"]'),
  toast: document.querySelector('[data-testid="toast"]'),
  template: document.getElementById('note-template'),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // non-JSON error body
    }
    const err = new Error(payload.error || `request failed: ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3000);
}

function queryString() {
  const params = new URLSearchParams();
  const q = els.search.value.trim();
  if (q) params.set('q', q);
  const [sort, order] = els.sort.value.split('-');
  params.set('sort', sort);
  params.set('order', order);
  return `?${params.toString()}`;
}

async function loadNotes() {
  const data = await api(`/api/notes${queryString()}`);
  state.notes = data.notes;
  renderNotes();
}

function renderNotes() {
  els.list.replaceChildren();
  els.empty.hidden = state.notes.length > 0;
  for (const note of state.notes) {
    els.list.appendChild(renderNote(note));
  }
}

function renderNote(note) {
  const fragment = els.template.content.cloneNode(true);
  const root = fragment.querySelector('.note');
  root.dataset.noteId = note.id;
  fragment.querySelector('[data-testid="note-title"]').textContent = note.title;
  fragment.querySelector('[data-testid="note-updated"]').textContent = new Date(note.updatedAt).toLocaleString();
  const preview = note.body.length > 120 ? `${note.body.slice(0, 120)}...` : note.body;
  fragment.querySelector('[data-testid="note-body-preview"]').textContent = preview;
  const tagsEl = fragment.querySelector('[data-testid="note-tags"]');
  tagsEl.replaceChildren(
    ...note.tags.map((tag) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = tag;
      return chip;
    })
  );
  fragment
    .querySelector('[data-testid="note-summarize-button"]')
    .addEventListener('click', () => summarizeNote(note.id));
  fragment
    .querySelector('[data-testid="note-edit-button"]')
    .addEventListener('click', () => startEdit(note));
  fragment
    .querySelector('[data-testid="note-delete-button"]')
    .addEventListener('click', (event) => requestDelete(note.id, event.currentTarget));
  return fragment;
}

function resetForm() {
  state.editingId = null;
  els.form.reset();
  els.formHeading.textContent = 'Create note';
  els.save.textContent = 'Save note';
  els.cancelEdit.hidden = true;
}

function startEdit(note) {
  state.editingId = note.id;
  els.title.value = note.title;
  els.body.value = note.body;
  els.tags.value = note.tags.join(', ');
  els.formHeading.textContent = 'Edit note';
  els.save.textContent = 'Update note';
  els.cancelEdit.hidden = false;
  els.title.focus();
}

function requestDelete(noteId, button) {
  const timer = state.pendingDelete.get(noteId);
  if (timer) {
    clearTimeout(timer);
    state.pendingDelete.delete(noteId);
    api(`/api/notes/${noteId}`, { method: 'DELETE' })
      .then(() => {
        if (state.editingId === noteId) resetForm();
        showToast('Note deleted');
        return loadNotes();
      })
      .catch((err) => showToast(err.message));
    return;
  }
  const original = button.textContent;
  button.textContent = 'Confirm delete';
  button.dataset.confirming = 'true';
  state.pendingDelete.set(
    noteId,
    setTimeout(() => {
      button.textContent = original;
      delete button.dataset.confirming;
      state.pendingDelete.delete(noteId);
    }, 3000)
  );
}

async function summarizeNote(noteId) {
  els.summaryPanel.hidden = false;
  els.summaryLoading.hidden = false;
  els.summaryText.textContent = '';
  els.summaryText.dataset.provider = '';
  els.summaryText.dataset.faithfulness = '';
  els.summaryText.dataset.simulated = '';
  els.summaryVerified.hidden = true;
  els.summaryWarning.hidden = true;
  try {
    const result = await api(`/api/notes/${noteId}/summarize`, { method: 'POST' });
    els.summaryText.textContent = result.summary;
    els.summaryText.dataset.provider = result.provider;
    if (result.faithfulness) {
      els.summaryText.dataset.faithfulness = String(result.faithfulness.score);
    }
    if (result.simulated) {
      els.summaryText.dataset.simulated = result.simulated;
    }
    if (result.fallback || !result.faithfulness || !result.faithfulness.grounded) {
      els.summaryWarning.textContent = result.fallback
        ? 'AI provider unavailable — showing fallback summary'
        : 'Unverified AI output — may contain inaccuracies';
      els.summaryWarning.hidden = false;
    } else {
      els.summaryVerified.hidden = false;
    }
  } catch (err) {
    showToast(err.message);
    els.summaryPanel.hidden = true;
  } finally {
    els.summaryLoading.hidden = true;
  }
}

function parseTags(raw) {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: els.title.value,
    body: els.body.value,
    tags: parseTags(els.tags.value),
  };
  try {
    if (state.editingId) {
      await api(`/api/notes/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Note updated');
    } else {
      await api('/api/notes', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Note created');
    }
    resetForm();
    await loadNotes();
  } catch (err) {
    showToast(err.message);
  }
});

els.cancelEdit.addEventListener('click', resetForm);

let searchTimer = null;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadNotes().catch((err) => showToast(err.message));
  }, 250);
});

els.sort.addEventListener('change', () => {
  loadNotes().catch((err) => showToast(err.message));
});

els.logout.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});

(async function init() {
  try {
    const { user } = await api('/api/me');
    els.userEmail.textContent = user.email;
    await loadNotes();
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/login';
      return;
    }
    showToast(err.message);
  }
})();
