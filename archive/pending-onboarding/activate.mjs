const api = String(window.BURGER_TIN_CHECKOUT?.apiBaseUrl || '').replace(/\/$/, '');
let invitationToken = location.hash.slice(1);
// Keep the credential out of referrers, browser history and persistent browser storage.
history.replaceState(null, '', location.pathname);
const form = document.querySelector('#activation-form');
const message = document.querySelector('#message');
let invitation;
const base64 = bytes => btoa(String.fromCharCode(...bytes));

async function call(path, body) {
  const response = await fetch(`${api}${path}`, { method:'POST', credentials:'omit', referrerPolicy:'no-referrer', headers:{'content-type':'application/json','x-requested-with':'restia-web'}, body:JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No pudimos completar la solicitud. Intentá nuevamente.');
  return data;
}

async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(atob(salt), c => c.charCodeAt(0)),iterations:120000}, key, 256);
  return base64(new Uint8Array(bits));
}

try {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(invitationToken)) throw new Error('Abrí el enlace completo del correo de bienvenida. Si venció, pedí una nueva invitación a Restia.');
  invitation = await call('/api/auth/invitation', {token:invitationToken});
  document.querySelector('#context').textContent = `Bienvenido a ${invitation.company}. Elegí tu contraseña para ingresar al panel.`;
  document.querySelector('#username').value = invitation.username;
  form.hidden = false;
} catch (error) {
  document.querySelector('#context').textContent = 'No pudimos abrir tu invitación.';
  message.className = 'error'; message.textContent = error.message;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const password = form.elements.password.value;
  message.textContent = ''; message.className = 'error';
  if (password !== form.elements.confirm.value) { message.textContent = 'Las contraseñas no coinciden.'; return; }
  if (password.length < 10 || password.length > 128) { message.textContent = 'Usá entre 10 y 128 caracteres.'; return; }
  const button = form.querySelector('button'); button.disabled = true; button.textContent = 'Activando…';
  try {
    const passwordSalt = base64(crypto.getRandomValues(new Uint8Array(16)));
    const result = await call('/api/auth/activate', {token:invitationToken,passwordSalt,passwordVerifier:await derive(password,passwordSalt),comparisonVerifier:await derive(password,invitation.passwordSalt)});
    const panel = new URL(result.panelUrl);
    if (panel.protocol !== 'https:' || !/^[a-z0-9-]+\.restia\.net\.ar$/.test(panel.hostname) || panel.pathname !== '/admin/') throw new Error('Acceso activado. Contactá a Restia para obtener la dirección del panel.');
    invitationToken = ''; form.reset(); form.hidden = true;
    document.querySelector('h1').textContent = 'Tu acceso está listo';
    document.querySelector('#context').textContent = `Ingresá al panel con el usuario ${result.username} y tu nueva contraseña.`;
    message.className = ''; message.textContent = 'La invitación ya fue utilizada y no podrá volver a usarse.';
    const link = document.querySelector('#open-panel'); link.href = panel.href; link.hidden = false;
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; button.textContent = 'Activar mi acceso'; }
});
