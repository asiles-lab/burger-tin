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
let welcomeEmailConfigured = false;
let currentView = 'companies';
let selectedStoreId = '';
const themeStorageKey = 'restia-admin-theme';

function setAdminTheme(theme, { persist = true } = {}) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (persist) localStorage.setItem(themeStorageKey, dark ? 'dark' : 'light');
  const toggle = $('#theme-toggle');
  if (!toggle) return;
  toggle.querySelector('.theme-label').textContent = dark ? 'Modo claro' : 'Modo oscuro';
  toggle.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
  toggle.querySelector('svg').innerHTML = dark
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
    : '<path d="M20.7 15.1A9 9 0 0 1 8.9 3.3 9 9 0 1 0 20.7 15.1Z"/>';
}

function requestConfirmation({ title, description, confirmLabel = 'Confirmar' }) {
  const dialog = $('#action-dialog');
  const button = $('#action-dialog-confirm');
  dialog.returnValue = 'cancel';
  $('#action-dialog-title').textContent = title;
  $('#action-dialog-description').textContent = description;
  button.textContent = confirmLabel;
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once:true });
    dialog.showModal();
    button.focus();
  });
}

setAdminTheme(localStorage.getItem(themeStorageKey) || 'light', { persist:false });

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
  $('#urls-view').hidden = true;
  $('#new-company').hidden = false;
  $('#new-profile').hidden = true;
  $('#platform-eyebrow').textContent = 'Gestión central';
  $('#platform-title').textContent = 'Empresas';
  document.querySelectorAll('[data-platform-view]').forEach(button => button.classList.toggle('active', button.dataset.platformView === 'companies'));
  $('#companies').innerHTML = stores.length ? stores.map(store => {
    const companyProfiles = profiles.filter(profile => profile.store_id === store.id);
    const active = companyProfiles.filter(profile => profile.active).length;
    const setupReady = store.setup_status === 'activo';
    const welcomeLabels = {waiting_site:'Esperando el sitio',email_setup_required:'Configurar correo',sending:'Enviando',sent:'Enviado al proveedor',retry:'Reintentando',needs_review:'Revisar envío',activated:'Acceso activado'};
    const welcome = store.welcome_enabled ? `<div class="company-readiness"><span>Bienvenida <b>${escapeHtml(welcomeLabels[store.welcome_status] || 'Pendiente')}</b></span>${store.welcome_error ? `<small>${escapeHtml(store.welcome_error)}</small>` : ''}</div><div class="company-actions">${store.welcome_status !== 'activated' ? `<button class="secondary" data-check-welcome="${escapeHtml(store.id)}">Verificar sitio y bienvenida</button>` : ''}${['sent','needs_review'].includes(store.welcome_status) ? `<button class="secondary" data-resend-welcome="${escapeHtml(store.id)}">Reenviar invitación</button>` : ''}</div>` : '';
    return `<article class="company-card"><div class="company-logo"><img src="assets/restia-favicon.png" alt=""></div><div class="company-copy"><span class="status-dot ${setupReady ? '' : 'status-pending'}">${escapeHtml(store.status || 'En preparación')}</span><h2>${escapeHtml(store.name)}</h2><p>Administrador ${active ? 'activo' : 'pendiente'} · Menú y panel de gestión</p><div class="company-host">${escapeHtml(store.public_host || `${store.slug || store.id}.restia.net.ar`)}</div></div><div class="company-meta"><span>Usuarios activos</span><strong>${active}</strong><div class="company-readiness"><span>Worker <b>${escapeHtml(store.worker_service || 'pendiente')}</b></span><span>DNS / TLS <b>${escapeHtml(store.dns_status || 'pendiente')}</b></span></div><div class="company-actions"><button data-open-store="${escapeHtml(store.id)}">Gestionar accesos →</button>${store.route_status === 'conectado' ? '<span class="domain-connected">Worker enlazado</span>' : `<button class="secondary" data-configure-domain="${escapeHtml(store.id)}">Conectar Worker y DNS</button>`}</div>${welcome}</div></article>`;
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
  $('#urls-view').hidden = true;
  $('#new-company').hidden = true;
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

function urlRow(label, url, status = '') {
  return `<div class="url-row"><div class="url-kind"><strong>${escapeHtml(label)}</strong>${status ? `<span>${escapeHtml(status)}</span>` : ''}</div><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a><div class="url-actions"><button class="secondary" type="button" data-copy-url="${escapeHtml(url)}">Copiar</button><a class="url-open" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Abrir <span aria-hidden="true">↗</span></a></div></div>`;
}

function renderUrls() {
  currentView = 'urls';
  selectedStoreId = '';
  $('#companies-view').hidden = true;
  $('#profiles-view').hidden = true;
  $('#urls-view').hidden = false;
  $('#new-company').hidden = true;
  $('#new-profile').hidden = true;
  $('#platform-eyebrow').textContent = 'Accesos centralizados';
  $('#platform-title').textContent = 'Mapa de URLs';
  document.querySelectorAll('[data-platform-view]').forEach(button => button.classList.toggle('active', button.dataset.platformView === 'urls'));
  const globalUrls = `${urlRow('Sitio institucional', 'https://restia.net.ar/', 'Público')}${urlRow('Super Admin', 'https://admin.restia.net.ar/', 'Equipo Restia')}`;
  const clientGroups = stores.map(store => {
    const host = store.public_host || `${store.slug || store.id}.restia.net.ar`;
    const siteUrl = `https://${host}/`;
    const ready = store.route_status === 'conectado' || ['activo','active'].includes(String(store.dns_status || '').toLowerCase());
    const state = ready ? 'Disponible' : 'Pendiente de conexión';
    return `<section class="url-client"><div class="url-client-head"><div><h3>${escapeHtml(store.name)}</h3><p>${escapeHtml(host)}</p></div><span class="url-route-state ${ready ? 'is-ready' : ''}">${escapeHtml(state)}</span></div>${urlRow('Sitio del cliente', siteUrl, 'Público')}${urlRow('Admin del cliente', `${siteUrl}admin/`, 'Acceso privado')}</section>`;
  }).join('');
  $('#url-map').innerHTML = `<section class="url-client url-global"><div class="url-client-head"><div><h3>Restia</h3><p>Canales institucionales y administración central</p></div></div>${globalUrls}</section>${clientGroups || '<p class="empty">Creá una empresa para generar sus accesos.</p>'}`;
  $('#url-count').textContent = `${stores.length} ${stores.length === 1 ? 'cliente' : 'clientes'} · ${stores.length * 2 + 2} URLs`;
}

function renderCurrentView() {
  if (currentView === 'platform') renderProfileGroup('platform');
  else if (currentView === 'store' && stores.some(store => store.id === selectedStoreId)) renderProfileGroup('store', selectedStoreId);
  else if (currentView === 'urls') renderUrls();
  else renderCompanies();
}

async function refreshData() {
  const result = await call('/api/platform/profiles');
  stores = result.stores || [];
  profiles = result.profiles || [];
  welcomeEmailConfigured = Boolean(result.welcomeEmailConfigured);
  const emailNotice = $('#email-service-status');
  emailNotice.hidden = welcomeEmailConfigured;
  emailNotice.textContent = 'Bienvenidas por email pendientes: falta verificar noreply@restia.net.ar y conectar el servicio de envío. Las invitaciones no se enviarán hasta completar esa configuración.';
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
  for (const checkbox of form.querySelectorAll('[name="permissions"]')) checkbox.checked = !isPlatform;
  $('#initial-password-field').hidden = false;
  $('#store-permissions').hidden = isPlatform;
  $('#profile-dialog-eyebrow').textContent = isPlatform ? 'Equipo Restia' : storeName(selectedStoreId);
  $('#profile-dialog-title').textContent = isPlatform ? 'Nuevo Super Admin' : 'Nuevo usuario';
  $('#profile-dialog-context').textContent = isPlatform ? 'Tendrá acceso a la administración global. Esta base es independiente de los clientes.' : 'El acceso quedará limitado a esta empresa. Podés reutilizar el mismo nombre de usuario en otros clientes.';
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

$('#logout').addEventListener('click', async () => {
  if (await requestConfirmation({ title:'¿Cerrar sesión?', description:'Vas a salir del Super Admin. Para volver a ingresar necesitarás tu usuario y contraseña.', confirmLabel:'Sí, salir' })) logout();
});
$('#theme-toggle').addEventListener('click', () => setAdminTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('#new-profile').addEventListener('click', openCreateProfile);
$('#back-companies').addEventListener('click', renderCompanies);

function openCreateCompany() {
  const form = $('#company-form');
  form.reset();
  $('#company-error').textContent = '';
  $('#company-host-preview').textContent = 'tu-empresa.restia.net.ar';
  $('#company-dialog').showModal();
}

$('#new-company').addEventListener('click', openCreateCompany);
$('#company-form').addEventListener('click', event => {
  if (event.target.closest('[data-close-company]')) $('#company-dialog').close();
});
$('#company-form').elements.slug.addEventListener('input', event => {
  const slug = event.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  $('#company-host-preview').textContent = `${slug || 'tu-empresa'}.restia.net.ar`;
});
$('#company-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = $('#save-company');
  button.disabled = true;
  $('#company-error').textContent = '';
  try {
    const response = await call('/api/platform/companies', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ companyName:data.get('companyName'), slug:data.get('slug'), adminName:data.get('adminName'), email:data.get('email'), username:data.get('username') })
    });
    form.reset();
    $('#company-dialog').close();
    await refreshData();
    const result = response;
    $('#company-result').innerHTML = `<div class="dialog-head"><div><p class="eyebrow">Empresa creada</p><h2>${escapeHtml(result.store.name)}</h2></div><button type="button" class="dialog-close" data-close-result aria-label="Cerrar">×</button></div><p>Se generó el usuario inicial <strong>@${escapeHtml(result.admin.username)}</strong> (${escapeHtml(result.admin.name)}). Recibirá un enlace para crear su contraseña cuando el sitio y el panel estén listos por HTTPS.</p><div class="result-url-list"><div><span>Menú digital reservado</span><code>${escapeHtml(result.urls.menu)}</code></div><div><span>Panel del local reservado</span><code>${escapeHtml(result.urls.localAdmin)}</code></div><div><span>Gestión Restia</span><code>${escapeHtml(result.urls.superAdmin)}</code></div></div><div class="route-warning"><strong>Enrutamiento y DNS pendientes</strong><p>Estas direcciones todavía no están activas. Antes hay que preparar y desplegar el menú propio de ${escapeHtml(result.store.name)}, asignar su Worker de Cloudflare y conectar el host con TLS. No se apunta a la web de Burger Tin.</p></div><div class="dialog-actions"><button type="button" class="secondary" data-close-result>Cerrar</button><button type="button" data-open-company-users="${escapeHtml(result.store.id)}">Ver usuarios de la empresa</button></div>`;
    $('#company-result-dialog').showModal();
  } catch (error) {
    $('#company-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$('#company-result-dialog').addEventListener('click', event => {
  if (event.target.closest('[data-close-result]')) $('#company-result-dialog').close();
  const button = event.target.closest('[data-open-company-users]');
  if (button) {
    $('#company-result-dialog').close();
    renderProfileGroup('store', button.dataset.openCompanyUsers);
  }
});

document.querySelector('.side-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-platform-view]');
  if (!button) return;
  if (button.dataset.platformView === 'platform') renderProfileGroup('platform');
  else if (button.dataset.platformView === 'urls') renderUrls();
  else renderCompanies();
});

$('#url-map').addEventListener('click', async event => {
  const button = event.target.closest('[data-copy-url]');
  if (!button) return;
  const url = button.dataset.copyUrl;
  const status = $('#url-copy-status');
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = `Copiado: ${url}`;
    button.textContent = 'Copiado';
    setTimeout(() => { button.textContent = 'Copiar'; }, 1600);
  } catch {
    status.textContent = 'No pudimos copiar automáticamente. Seleccioná la dirección y copiala desde el navegador.';
  }
});

function openDomainConfiguration(storeId) {
  const company = stores.find(store => store.id === storeId);
  if (!company) return;
  const form = $('#domain-form');
  form.reset();
  form.elements.storeId.value = company.id;
  form.elements.hostname.value = company.public_host || `${company.slug}.restia.net.ar`;
  form.elements.workerService.value = `restia-tenant-${company.slug || company.id}`;
  $('#domain-result').textContent = '';
  $('#domain-error').textContent = '';
  $('#domain-dialog').showModal();
}

$('#domain-form').addEventListener('click', event => {
  if (event.target.closest('[data-close-domain]')) $('#domain-dialog').close();
});
$('#domain-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const storeId = form.elements.storeId.value;
  const button = $('#connect-domain');
  button.disabled = true;
  $('#domain-error').textContent = '';
  $('#domain-result').textContent = '';
  try {
    const result = await call(`/api/platform/companies/${encodeURIComponent(storeId)}/domain`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ confirmReady:form.elements.confirmReady.checked }) });
    await refreshData();
    $('#domain-result').textContent = `${result.message} Host: ${result.hostname}; Worker: ${result.workerService}.`;
  } catch (error) {
    $('#domain-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#companies').addEventListener('click', event => {
  const configure = event.target.closest('[data-configure-domain]');
  if (configure) {
    openDomainConfiguration(configure.dataset.configureDomain);
    return;
  }
  const button = event.target.closest('[data-open-store]');
  if (button) renderProfileGroup('store', button.dataset.openStore);
});

$('#companies').addEventListener('click', async event => {
  const button = event.target.closest('[data-check-welcome],[data-resend-welcome]');
  if (!button) return;
  const resend = Boolean(button.dataset.resendWelcome);
  if (resend && !confirm('¿Querés enviar otra invitación? El enlace anterior dejará de funcionar.')) return;
  const id = button.dataset.resendWelcome || button.dataset.checkWelcome;
  const note = $('#welcome-action-status');
  button.disabled = true; note.textContent = 'Comprobando el sitio y el estado del envío…';
  try {
    const result = await call(`/api/platform/companies/${encodeURIComponent(id)}/welcome`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({resend})});
    await refreshData();
    note.textContent = result.welcome.message || ({sent:'El proveedor aceptó el correo de bienvenida.',activated:'El usuario ya activó su acceso.',sending:'El envío ya está en curso.'}[result.welcome.state] || 'Estado actualizado.');
  } catch (error) { note.textContent = error.message; }
  finally { button.disabled = false; }
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
