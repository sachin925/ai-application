'use strict';

const form = document.querySelector('[data-testid="login-form"]');
const errorEl = document.querySelector('[data-testid="login-error"]');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const email = form.email.value;
  const password = form.password.value;
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (response.ok) {
    window.location.href = '/';
    return;
  }
  errorEl.textContent = 'Invalid email or password';
  errorEl.hidden = false;
});
