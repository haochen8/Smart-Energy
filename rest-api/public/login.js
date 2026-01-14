const form = document.getElementById('loginForm');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const statusEl = document.getElementById('status');
const clearBtn = document.getElementById('clearBtn');

function setStatus(message, ok = null) {
  statusEl.textContent = message;
  if (ok === true) {
    statusEl.className = 'status ok';
  } else if (ok === false) {
    statusEl.className = 'status error';
  } else {
    statusEl.className = 'status';
  }
}

async function login(username, password) {
  const res = await fetch('/ui/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error('Invalid credentials.');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!username || !password) {
    setStatus('Username and password are required.', false);
    return;
  }
  try {
    setStatus('Signing in...');
    await login(username, password);
    setStatus('Access granted. Redirecting...', true);
    window.location.href = '/ui';
  } catch (err) {
    console.error(err);
    setStatus('Invalid credentials.', false);
  }
});

clearBtn.addEventListener('click', () => {
  usernameInput.value = '';
  passwordInput.value = '';
  setStatus('Awaiting credentials.');
});
