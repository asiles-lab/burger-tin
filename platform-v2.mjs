const config = window.BURGER_TIN_CHECKOUT || {};
const api = String(config.apiBaseUrl || '').replace(/\/$/, '');
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const permissionNames = {
  'orders:view':'Ver pedidos',
  'orders:manage':'Gestionar pedidos',
  'products:manage':'Productos',
  'store:manage':'Configuración',
  'reports:view':'Reportes BI',
  'billing:manage':'Facturación',
  'platform:manage':'Administración global'
};

let token = sessionStorage.getItem('restia-platform-session') || '';
let currentUser = null;
let stores = [];
let profiles = [];
let profilesById = new Map();
let currentView = 'companies';
let selectedStoreId = '';

document.querySelector('.platform-brand').innerHTML = '<img src="assets/restia-wordmark.png" alt="Restia"><span>Tecnología para crecer.</span>';
document.querySelector('.login-card').innerHTML = '<p class="eyebrow">Administración central</p><h1>Super Admin Restia</h1><p>Ingresá con tu usuario y contraseña.</p><form id="login-form"><label>Usuario<input name="username" required autocomplete="username" autocapitalize="none"></label><label>Contraseña<input name="password" type="password" required minlength="10" autocomplete="current-password"></label><button>Ingresar</button></form><p class="error" id="login-error" role="alert"></p>';
document.querySelector('#profile-form').innerHTML = `<input type="hidden" name="profileId"><input type="hidden" name="scope"><div class="dialog-head"><div><p class="eyebrow" id="profile-dialog-eyebrow">Nuevo acceso</p><h2 id="profile-dialog-title">Crear usuario</h2><p class="dialog-context" id="profile-dialog-context"></p></div><button type="button" class="dialog-close" data-close-profile aria-label="Cerrar">×</button></div><label>Nombre<input name="name" required minlength="2" maxlength="80"></label><label>Email<input name="email" type="email" required></label><label>Usuario<input name="username" required minlength="3" maxlength="40" pattern="[a-z0-9._-]+" autocapitalize="none"></label><label id="initial-password-field">Contraseña inicial<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password"><small>Deberá cambiarla en el primer ingreso.</small></label><label>Rol<input name="role" required maxlength="50" placeholder="Ej. Encargado de turno"></label><fieldset id="store-permissions"><legend>Permisos de la empresa</legend><label><input type="checkbox" name="permissions" value="orders:view"> Ver pedidos</label><label><input type="checkbox" name="permissions" value="orders:manage"> Confirmar, cancelar e imprimir</label><label><input type="checkbox" name="permissions" value="products:manage"> Gestionar productos</label><label><input type="checkbox" name="permissions" value="store:manage"> Configurar la tienda</label><label><input type="checkbox" name="permissions" value="reports:view"> Acceder a reportes BI</label><label><input type="checkbox" name="permissions" value="billing:manage"> Gestionar facturación</label></fieldset><p class="error" id="profile-error"></p><div class="dialog-actions"><button type="button" class="secondary" data-close-profile>Cancelar</button><button type="submit" id="save-profile">Crear usuario</button></div>`;

async function call(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers:{ ...options.headers, authorization:`Bearer ${token}`, 'x-requested-with':'restia-web' } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
  return result;
}

const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes));

async function deriveCredential(password, salt, iterations = 120000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:Uint8Array.from(atob(salt), char => char.charCodeAt(0)), iterations }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}

async function newCredential(password) {
  const passwordSalt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  return { passwordSalt, passwordVerifier:await deriveCredential(password, passwordSalt) };
}

async function challenge(username, scope) {
  const response = await fetch(`${api}/api/auth/challenge`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ username, scope }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No pudimos preparar el acceso.');
  return result;
}

async function authenticate(username, password) {
  const passwordChallenge = await challenge(username, 'platform');
  const passwordVerifier = await deriveCredential(password, passwordChallenge.salt, passwordChallenge.iterations);
  const response = await fetch(`${api}/api/auth/login`, { method:'POST', headers:{ 'content-type':'application/json', 'x-requested-with':'restia-web' }, body:JSON.stringify({ username, passwordVerifier, passwordSalt:passwordChallenge.salt, scope:'platform' }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No pudimos iniciar sesión.');
  return result;
}

function storeName(id) {
  return stores.find(store => store.id === id)?.name || id;
}

function renderCompanies() {
  currentView = 'companies';
  selectedStoreId = '';
  $('#companies-view').hidden = false;
  $('#profiles-view').hidden = true;
  $('#new-profile').hidden = true;
  $('#platform-eyebrow').textContent = 'Gestión central';
  $('#platform-title').textContent = 'Empresas';
  document.querySelectorAll('[data-platform-view]').forEach(button => button.classList.toggle('active', button.dataset.platformView === 'companies'));
  $('#companies').innerHTML = stores.length ? stores.map(store => {
    const companyProfiles = profiles.filter(profile => profile.store_id === store.id);
    const active = companyProfiles.filter(profile => profile.active).length;
    return `<article class="company-card"><div class="company-logo"><img src="assets/logo-burger-tun.png" alt="${escapeHtml(store.name)}"></div><div class="company-copy"><span class="status-dot">${escapeHtml(store.status || 'Activo')}</span><h2>${escapeHtml(store.name)}</h2><p>Menú digital, pedidos, impresión y configuración comercial.</p></div><div class="company-meta"><span>Usuarios activos</span><strong>${active}</strong><button data-open-store="${escapeHtml(store.id)}">Gestionar empresa →</button></div></article>`;
  }).join('') : '<p class="empty">Todavía no hay empresas registradas.</p>';
}

function renderProfiles(groupProfiles) {
  profilesById = new Map(groupProfiles.map(profile => [profile.id, profile]));
  $('#active-profiles').textContent = groupProfiles.filter(profile => profile.active).length;
  $('#profiles').innerHTML = groupProfiles.length ? groupProfiles.map(profile => `<div class="profile-row" data-id="${escapeHtml(profile.id)}"><div class="profile-user"><strong>${escapeHtml(profile.name)}</strong><small>@${escapeHtml(profile.username)}</small></div><span>${escapeHtml(profile.role)}</span><div class="permission-list">${profile.permissions.map(permission => `<span>${escapeHtml(permissionNames[permission] || permission)}</span>`).join('')}</div><div class="profile-actions"><label class="status-toggle"><input type="checkbox" ${profile.active ? 'checked' : ''}> ${profile.active ? 'Activo' : 'Desactivado'}</label><div class="profile-buttons"><button class="secondary" data-edit-profile>Editar</button><button class="secondary" data-reset-password>Restablecer clave</button><button class="danger" data-delete-profile>Eliminar</button></div></div></div>`).join('') : '<p class="empty profile-empty">Todavía no hay usuarios en este grupo.</p>';
}

function renderProfileGroup(view, storeId = '') {
  currentView = view;
  selectedStoreId = storeId;
  const isPlatform = view === 'platform';
  const name = isPlatform ? 'Equipo Restia' : storeName(storeId);
  const groupProfiles = profiles.filter(profile => isPlatform ? profile.store_id === 'platform' : profile.store_id === storeId);
  $('#companies-view').hidden = true;
  $('#profiles-view').hidden = false;
  $('#back-companies').hidden = isPlatform;
  $('#new-profile').hidden = false;
  $('#new-profile').textContent = isPlatform ? '＋ Nuevo Super Admin' : '＋ Nuevo usuario';
  $('#platform-eyebrow').textContent = isPlatform ? 'Administración interna' : 'Empresa';
  $('#platform-title').textContent = name;
  $('#profiles-title').textContent = isPlatform ? 'Superadmins' : `Usuarios de ${name}`;
  $('#profiles-description').textContent = isPlatform ? 'Accesos internos con permiso para administrar toda la plataforma.' : 'Estos usuarios solo pueden ingresar al panel de esta empresa.';
  $('#profile-context').innerHTML = isPlatform ? '<img src="assets/restia-favicon.png" alt=""><div><span class="context-label">Base de usuarios interna</span><h2>Restia</h2><p>Separada de los usuarios de cada empresa.</p></div>' : `<img src="assets/logo-burger-tun.png" alt=""><div><span class="context-label">Empresa activa</span><h2>${escapeHtml(name)}</h2><p>Usuarios, roles y permisos exclusivos de esta empresa.</p></div>`;
  document.querySelectorAll('[data-platform-view]').forEach(button => button.classList.toggle('active', button.dataset.platformView === (isPlatform ? 'platform' : 'companies')));
  renderProfiles(groupProfiles);
}

function renderCurrentView() {
  if (currentView === 'platform') renderProfileGroup('platform');
  else if (currentView === 'store' && stores.some(store => store.id === selectedStoreId)) renderProfileGroup('store', selectedStoreId);
  else renderCompanies();
}

async function refreshData() {
  const result = await call('/api/platform/profiles');
  stores = result.stores || [];
  profiles = result.profiles || [];
  renderCurrentView();
}

function openCreateProfile() {
  const isPlatform = currentView === 'platform';
  const form = $('#profile-form');
  form.reset();
  form.elements.profileId.value = '';
  form.elements.scope.value = isPlatform ? 'platform' : selectedStoreId;
  form.elements.password.required = true;
  form.elements.role.value = isPlatform ? 'Superadmin' : 'Administrador';
  $('#initial-password-field').hidden = false;
  $('#store-permissions').hidden = isPlatform;
  $('#profile-dialog-eyebrow').textContent = isPlatform ? 'Equipo Restia' : storeName(selectedStoreId);
  $('#profile-dialog-title').textContent = isPlatform ? 'Nuevo Super Admin' : 'Nuevo usuario';
  $('#profile-dialog-context').textContent = isPlatform ? 'Tendrá acceso a la administración global.' : 'El acceso quedará limitado a esta empresa.';
  $('#save-profile').textContent = 'Crear usuario';
  $('#profile-error').textContent = '';
  $('#profile-dialog').showModal();
}

function openEditProfile(profile) {
  const isPlatform = profile.store_id === 'platform';
  const form = $('#profile-form');
  form.reset();
  form.elements.profileId.value = profile.id;
  form.elements.scope.value = profile.store_id;
  form.elements.name.value = profile.name;
  form.elements.email.value = profile.email;
  form.elements.username.value = profile.username;
  form.elements.role.value = profile.role;
  form.elements.password.required = false;
  $('#initial-password-field').hidden = true;
  $('#store-permissions').hidden = isPlatform;
  for (const checkbox of form.querySelectorAll('[name="permissions"]')) checkbox.checked = profile.permissions.includes(checkbox.value);
  $('#profile-dialog-eyebrow').textContent = isPlatform ? 'Equipo Restia' : storeName(profile.store_id);
  $('#profile-dialog-title').textContent = profile.name;
  $('#profile-dialog-context').textContent = 'Editá la identidad, el rol y los permisos de este usuario.';
  $('#save-profile').textContent = 'Guardar cambios';
  $('#profile-error').textContent = '';
  $('#profile-dialog').showModal();
}

async function forcePasswordChange() {
  if (!currentUser?.mustChangePassword) return;
  const passwordChallenge = await challenge(currentUser.username, 'platform');
  const dialog = document.createElement('dialog');
  dialog.className = 'password-dialog';
  dialog.innerHTML = '<form><p class="eyebrow">Primer ingreso</p><h2>Creá tu contraseña definitiva</h2><p>Debe tener al menos 10 caracteres y ser distinta de la contraseña temporal.</p><label>Nueva contraseña<input name="password" type="password" minlength="10" maxlength="128" required autocomplete="new-password"></label><label>Repetir contraseña<input name="confirm" type="password" minlength="10" maxlength="128" required autocomplete="new-password"></label><p class="error" role="alert"></p><button>Guardar contraseña</button></form>';
  document.body.append(dialog);
  dialog.showModal();
  await new Promise(resolve => dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = form.elements.password.value;
    if (password !== form.elements.confirm.value) {
      form.querySelector('.error').textContent = 'Las contraseñas no coinciden.';
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const credential = await newCredential(password);
      const comparisonVerifier = await deriveCredential(password, passwordChallenge.salt, passwordChallenge.iterations);
      await call('/api/auth/change-password', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ ...credential, comparisonVerifier }) });
      currentUser.mustChangePassword = false;
      dialog.close();
      dialog.remove();
      resolve();
    } catch (error) {
      form.querySelector('.error').textContent = error.message;
      button.disabled = false;
    }
  }));
}

async function load() {
  const session = await call('/api/admin/session');
  currentUser = session.user;
  if (!currentUser.permissions.includes('platform:manage')) throw new Error('Este usuario no tiene acceso al Super Admin.');
  await forcePasswordChange();
  await refreshData();
  $('.account-card strong').textContent = currentUser.name;
  $('.account-card small').textContent = currentUser.role;
  $('.account-card .avatar').textContent = (currentUser.name || 'A').trim().charAt(0).toUpperCase();
  $('#login').hidden = true;
  $('#platform-shell').hidden = false;
  sessionStorage.setItem('restia-platform-session', token);
}

async function logout(message = '') {
  if (token) call('/api/auth/logout', { method:'POST' }).catch(() => {});
  token = '';
  currentUser = null;
  sessionStorage.removeItem('restia-platform-session');
  sessionStorage.removeItem('tin-control-platform-token');
  $('#platform-shell').hidden = true;
  $('#login').hidden = false;
  $('#login-error').textContent = message;
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const data = new FormData(event.currentTarget);
  button.disabled = true;
  $('#login-error').textContent = '';
  try {
    const result = await authenticate(data.get('username'), data.get('password'));
    token = result.session;
    currentUser = result.user;
    await load();
  } catch (error) {
    token = '';
    $('#login-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#logout').addEventListener('click', () => logout());
$('#new-profile').addEventListener('click', openCreateProfile);
$('#back-companies').addEventListener('click', renderCompanies);

document.querySelector('.side-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-platform-view]');
  if (!button) return;
  if (button.dataset.platformView === 'platform') renderProfileGroup('platform');
  else renderCompanies();
});

$('#companies').addEventListener('click', event => {
  const button = event.target.closest('[data-open-store]');
  if (button) renderProfileGroup('store', button.dataset.openStore);
});

$('#profile-form').addEventListener('click', event => {
  if (event.target.closest('[data-close-profile]')) $('#profile-dialog').close();
});

$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = $('#save-profile');
  const profileId = data.get('profileId');
  button.disabled = true;
  $('#profile-error').textContent = '';
  try {
    const body = { name:data.get('name'), email:data.get('email'), username:data.get('username'), role:data.get('role'), permissions:data.getAll('permissions') };
    if (profileId) {
      await call(`/api/platform/profiles/${encodeURIComponent(profileId)}`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify(body) });
    } else {
      Object.assign(body, { scope:data.get('scope'), ...await newCredential(data.get('password')) });
      await call('/api/platform/profiles', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify(body) });
    }
    form.reset();
    $('#profile-dialog').close();
    await refreshData();
  } catch (error) {
    $('#profile-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#profiles').addEventListener('change', async event => {
  const checkbox = event.target.closest('input[type=checkbox]');
  if (!checkbox) return;
  const row = checkbox.closest('.profile-row');
  checkbox.disabled = true;
  try {
    await call(`/api/platform/profiles/${encodeURIComponent(row.dataset.id)}`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ active:checkbox.checked }) });
    await refreshData();
  } catch (error) {
    alert(error.message);
    checkbox.checked = !checkbox.checked;
  } finally {
    checkbox.disabled = false;
  }
});

$('#profiles').addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  const row = button.closest('.profile-row');
  const profile = profilesById.get(row.dataset.id);
  if (button.matches('[data-edit-profile]')) {
    openEditProfile(profile);
    return;
  }
  if (button.matches('[data-delete-profile]')) {
    if (!confirm(`¿Estás seguro de que querés eliminar al usuario “${profile.name}” (@${profile.username})? Perderá el acceso inmediatamente y esta acción no se puede deshacer.`)) return;
    button.disabled = true;
    try {
      await call(`/api/platform/profiles/${encodeURIComponent(row.dataset.id)}`, { method:'DELETE' });
      await refreshData();
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
    return;
  }
  if (!button.matches('[data-reset-password]')) return;
  const password = prompt('Ingresá una nueva contraseña temporal de al menos 10 caracteres.');
  if (!password) return;
  if (password.length < 10) {
    alert('La contraseña debe tener al menos 10 caracteres.');
    return;
  }
  button.disabled = true;
  try {
    const credential = await newCredential(password);
    await call(`/api/platform/profiles/${encodeURIComponent(row.dataset.id)}`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify(credential) });
    alert('Contraseña restablecida. El usuario deberá cambiarla al ingresar y no podrá reutilizar esta clave temporal.');
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

if (token) load().catch(() => logout('La sesión venció. Volvé a ingresar.'));
