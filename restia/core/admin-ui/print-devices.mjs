const runtime = window.RESTIA_CLIENT_CONFIG || window.BURGER_TIN_CHECKOUT || {};
const apiBaseUrl = String(runtime.apiBaseUrl || '').replace(/\/$/, '');
const settingsForm = document.querySelector('#store-form');

async function deviceCall(path, options = {}) {
  const token = sessionStorage.getItem('restia-store-session') || '';
  if (!token) throw new Error('Ingresá al panel para administrar impresoras.');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers:{ authorization:`Bearer ${token}`, 'x-requested-with':'restia-web', ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No pudimos completar la operación.');
  return result;
}

const escapeText = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

if (settingsForm && apiBaseUrl) {
  const styles = document.createElement('style');
  styles.textContent = '.print-devices-card{grid-column:1/-1}.print-devices-card textarea{width:100%;font:inherit}.device-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0;border-top:1px solid var(--line,#dfe5ec)}.device-row small{display:block;margin-top:.25rem;color:var(--muted,#667085)}.device-row>div:last-child{display:flex;gap:.5rem;flex-wrap:wrap}@media(max-width:700px){.device-row{align-items:flex-start;flex-direction:column}}';
  document.head.append(styles);
  const card = document.createElement('div');
  card.className = 'settings-card wide-card print-devices-card';
  card.innerHTML = `
    <p class="eyebrow">Impresión de comandas</p>
    <h2>Notebooks e impresoras</h2>
    <p>Cada equipo usa una credencial propia. Si un equipo deja de utilizarse, desactivalo sin afectar a los demás.</p>
    <div class="form-grid">
      <label>Nombre del equipo<input id="print-device-name" maxlength="80" placeholder="Ej. Notebook del mostrador"></label>
      <div class="form-actions"><button type="button" id="create-print-device">Crear credencial</button><button type="button" class="secondary" id="refresh-print-devices">Actualizar lista</button></div>
    </div>
    <div id="print-device-secret" hidden>
      <p><strong>Copiá este token ahora.</strong> Por seguridad no volverá a mostrarse.</p>
      <textarea readonly rows="3"></textarea>
      <button type="button" class="secondary" data-copy-device-token>Copiar token</button>
    </div>
    <p id="print-device-status" role="status"></p>
    <div id="print-device-list"></div>`;
  settingsForm.querySelector('.form-actions')?.before(card);

  const status = card.querySelector('#print-device-status');
  const list = card.querySelector('#print-device-list');
  const secret = card.querySelector('#print-device-secret');
  const render = devices => {
    list.innerHTML = devices.length ? devices.map(device => `
      <article class="device-row" data-device-id="${escapeText(device.id)}">
        <div><strong>${escapeText(device.name)}</strong><small>${device.active ? 'Activo' : 'Desactivado'}${device.last_seen_at ? ` · última conexión ${new Date(device.last_seen_at).toLocaleString('es-AR')}` : ''}</small></div>
        <div>${device.active ? '<button type="button" class="secondary" data-rotate-device>Rotar token</button><button type="button" class="danger" data-disable-device>Desactivar</button>' : ''}</div>
      </article>`).join('') : '<p class="empty">Todavía no hay impresoras registradas.</p>';
  };
  const showToken = token => {
    secret.hidden = false;
    secret.querySelector('textarea').value = token;
  };
  const load = async () => {
    status.textContent = 'Cargando dispositivos…';
    try { const result = await deviceCall('/api/admin/print-devices'); render(result.devices || []); status.textContent = ''; }
    catch (error) { status.textContent = error.message; }
  };

  card.querySelector('#refresh-print-devices').addEventListener('click', load);
  card.querySelector('#create-print-device').addEventListener('click', async event => {
    const name = card.querySelector('#print-device-name').value.trim();
    event.currentTarget.disabled = true;
    try {
      const result = await deviceCall('/api/admin/print-devices', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ name }) });
      showToken(result.token);
      card.querySelector('#print-device-name').value = '';
      await load();
    } catch (error) { status.textContent = error.message; }
    finally { event.currentTarget.disabled = false; }
  });
  card.querySelector('[data-copy-device-token]').addEventListener('click', async () => {
    await navigator.clipboard.writeText(secret.querySelector('textarea').value);
    status.textContent = 'Token copiado.';
  });
  list.addEventListener('click', async event => {
    const row = event.target.closest('[data-device-id]');
    if (!row) return;
    const id = encodeURIComponent(row.dataset.deviceId);
    try {
      if (event.target.closest('[data-rotate-device]')) {
        if (!confirm('¿Rotar el token? El token instalado actualmente dejará de funcionar.')) return;
        const result = await deviceCall(`/api/admin/print-devices/${id}/rotate`, { method:'POST' });
        showToken(result.token);
      } else if (event.target.closest('[data-disable-device]')) {
        if (!confirm('¿Desactivar este dispositivo? Dejará de recibir comandas.')) return;
        await deviceCall(`/api/admin/print-devices/${id}/disable`, { method:'POST' });
      } else return;
      await load();
    } catch (error) { status.textContent = error.message; }
  });
}
