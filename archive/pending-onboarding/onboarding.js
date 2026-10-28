const ACTIVATION_URL = 'https://admin.restia.net.ar/activar/';
const FROM = 'Restia <noreply@restia.net.ar>';
const REPLY_TO = 'atencion@restia.net.ar';
const DAY = 86400000;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso = value => new Date(value).toISOString();

export function companyHost(company) {
  const slug = String(company.slug || '');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) || ['admin','www','api','platform','restia','mail','ftp','assets'].includes(slug)) return null;
  const host = `${slug}.restia.net.ar`;
  return company.public_host === host && company.worker_service === `restia-tenant-${slug}` ? host : null;
}

export async function checkCompanyReadiness(company, fetcher = fetch) {
  const host = companyHost(company);
  if (!host || !company.worker_domain_id || !['conectado','activo'].includes(company.route_status)) return { ready:false, reason:'Falta conectar el Worker y el dominio de esta empresa.' };
  try {
    const response = await fetcher(`https://${host}/.well-known/restia-site.json`, { redirect:'manual', signal:AbortSignal.timeout(6000), headers:{'cache-control':'no-cache'} });
    if (response.status !== 200 || !(response.headers.get('content-type') || '').includes('application/json')) return { ready:false, reason:'Falta publicar la identificación y habilitación del sitio.' };
    const text = await response.text();
    const marker = text.length <= 4096 ? JSON.parse(text) : {};
    if (marker.storeId !== company.id || marker.workerService !== company.worker_service || marker.ready !== true || marker.adminPath !== '/admin/') return { ready:false, reason:'El sitio todavía no confirmó que pertenece a esta empresa y que su panel está listo.' };
    for (const path of ['/', '/admin/']) {
      const page = await fetcher(`https://${host}${path}`, { redirect:'manual', signal:AbortSignal.timeout(6000), headers:{'cache-control':'no-cache'} });
      const ready = page.status === 200 && (page.headers.get('content-type') || '').includes('text/html');
      await page.body?.cancel();
      if (!ready) return { ready:false, reason:'El sitio o el panel todavía no responde correctamente por HTTPS.' };
    }
    return { ready:true };
  } catch {
    return { ready:false, reason:'El dominio o el certificado HTTPS todavía no está disponible.' };
  }
}

export function welcomeEmail(company, profile, token, expiresAt) {
  const panel = `https://${companyHost(company)}/admin/`;
  const activation = `${ACTIVATION_URL}#${token}`;
  return {
    from:FROM, to:[profile.email], reply_to:REPLY_TO,
    subject:`${company.name}: tu espacio en Restia ya está listo`,
    text:`Hola ${profile.name},\n\nEl sitio de ${company.name} y su panel de gestión ya están disponibles.\n\nSitio: https://${company.public_host}/\nPanel: ${panel}\nUsuario: ${profile.username}\n\nCreá tu contraseña para ingresar: ${activation}\n\nEste enlace es personal, se puede usar una sola vez y vence en 24 horas (${expiresAt}). Si venció o necesitás ayuda, escribinos a ${REPLY_TO}.\n\nRestia · Tecnología para crecer.`,
    html:`<div style="background:#f6f7f9;padding:32px 16px;font-family:Arial,sans-serif;color:#142e43"><div style="max-width:560px;margin:auto;background:white;padding:32px;border-radius:16px"><p style="font-size:28px;font-weight:bold;margin-top:0">restia</p><h1 style="font-size:24px">Tu negocio ya tiene su espacio</h1><p>Hola ${escapeHtml(profile.name)}, el sitio de <strong>${escapeHtml(company.name)}</strong> y su panel de gestión ya están disponibles.</p><p><strong>Usuario:</strong> ${escapeHtml(profile.username)}</p><p><a href="${panel}">Abrir el panel de tu negocio</a> · <a href="https://${company.public_host}/">Ver el sitio</a></p><p style="margin:28px 0"><a href="${activation}" style="display:inline-block;background:#123c50;color:white;text-decoration:none;padding:14px 22px;border-radius:8px">Crear mi contraseña</a></p><p>Este enlace es personal, de un solo uso y vence en 24 horas. Después ingresás al panel con tu usuario y la contraseña que elegiste.</p><p style="font-size:14px;color:#54616d">¿Necesitás ayuda? Respondé este correo o escribinos a <a href="mailto:${REPLY_TO}">${REPLY_TO}</a>.</p><p style="font-size:12px;color:#54616d">Restia · Tecnología para crecer.</p></div></div>`
  };
}

export function createCompanyOnboarding(hooks) {
  const { publicJson, requireAdmin, readJson, randomToken, sha256, encryptSetting, decryptSetting, verifierRecord, credentialDigest, validCredentialMaterial, audit } = hooks;
  const configured = env => env.WELCOME_EMAIL_ENABLED === 'true' && Boolean(env.RESEND_API_KEY);
  const loadCompany = (env, id) => env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(id).first();

  async function status(env, id, state, message = null, delay = null) {
    await env.DB.prepare('UPDATE stores SET welcome_status = ?, welcome_error = ?, welcome_next_check_at = ? WHERE id = ?').bind(state, message, delay === null ? null : iso(Date.now() + delay), id).run();
    return { state, message };
  }

  async function processCompany(env, id) {
    const company = await loadCompany(env, id);
    if (!company?.active || !company.welcome_enabled) return { state:'not_scheduled' };
    let invitation = await env.DB.prepare('SELECT * FROM company_invitations WHERE store_id = ?').bind(id).first();
    if (invitation?.used_at) return status(env, id, 'activated');
    if (invitation?.sent_at) return status(env, id, 'sent');
    const ready = await checkCompanyReadiness(company);
    if (!ready.ready) return status(env, id, 'waiting_site', ready.reason, 300000);
    await env.DB.prepare("UPDATE stores SET setup_status = 'activo', dns_status = 'activo', updated_at = ? WHERE id = ?").bind(iso(Date.now()), id).run();
    if (!configured(env)) return status(env, id, 'email_setup_required', 'Falta habilitar el remitente y la clave de envío de Resend.', 3600000);
    const profile = await env.DB.prepare('SELECT * FROM admin_profiles WHERE id = ? AND store_id = ? AND active = 1').bind(company.initial_admin_profile_id, id).first();
    if (!profile) return status(env, id, 'needs_review', 'El administrador inicial ya no está disponible.');
    if (!profile.must_change_password) return status(env, id, 'activated');
    if (invitation && (invitation.email !== profile.email || invitation.expected_password_hash !== profile.password_hash)) return status(env, id, 'needs_review', 'Cambió el email o la contraseña del usuario. Revisá los datos y generá otra invitación.');
    const now = Date.now();
    if (invitation && (Date.parse(invitation.expires_at) <= now + 3600000 || invitation.attempts >= 8)) {
      await env.DB.prepare("UPDATE company_invitations SET encrypted_payload = NULL, status = 'expired' WHERE id = ?").bind(invitation.id).run();
      return status(env, id, 'needs_review', 'No se pudo completar el envío. Revisá la configuración y generá otra invitación.');
    }
    if (!invitation) {
      const token = randomToken(), invitationId = crypto.randomUUID(), expiresAt = iso(now + DAY);
      const payload = await encryptSetting(env, JSON.stringify(welcomeEmail(company, profile, token, expiresAt)));
      await env.DB.prepare(`INSERT OR IGNORE INTO company_invitations (id, store_id, profile_id, email, expected_password_hash, token_hash, encrypted_payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(invitationId, id, profile.id, profile.email, profile.password_hash, await sha256(token), payload, iso(now), expiresAt).run();
      invitation = await env.DB.prepare('SELECT * FROM company_invitations WHERE store_id = ?').bind(id).first();
    }
    const claim = crypto.randomUUID();
    const leased = await env.DB.prepare(`UPDATE company_invitations SET status = 'sending', claim_id = ?, lease_until = ?, attempts = attempts + 1 WHERE id = ? AND sent_at IS NULL AND used_at IS NULL AND status IN ('pending','sending','retry') AND (lease_until IS NULL OR lease_until < ?)`)
      .bind(claim, iso(now + 120000), invitation.id, iso(now)).run();
    if (!leased.meta.changes) return { state:'sending', message:'Ya hay un envío en curso.' };
    try {
      const payload = await decryptSetting(env, invitation.encrypted_payload);
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(10000),
        headers:{ authorization:`Bearer ${env.RESEND_API_KEY}`, 'content-type':'application/json', 'Idempotency-Key':`company-welcome/${invitation.id}` }, body:payload
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id) throw new Error('send_failed');
      // Persist provider acceptance before changing the company status. Retries use the same payload/key.
      await env.DB.prepare("UPDATE company_invitations SET status = CASE WHEN used_at IS NULL THEN 'sent' ELSE 'used' END, sent_at = ?, provider_id = ?, encrypted_payload = NULL, lease_until = NULL WHERE id = ? AND claim_id = ?")
        .bind(iso(Date.now()), String(result.id), invitation.id, claim).run();
      return status(env, id, 'sent');
    } catch {
      await env.DB.prepare("UPDATE company_invitations SET status = 'retry', lease_until = NULL WHERE id = ? AND claim_id = ? AND sent_at IS NULL AND used_at IS NULL").bind(invitation.id, claim).run();
      return status(env, id, 'retry', 'El proveedor no confirmó el envío. Se reintentará sin duplicarlo.', Math.min(3600000, 300000 * 2 ** invitation.attempts));
    }
  }

  async function processPending(env) {
    // Two companies per run keep network and database work inside the Workers Free limits.
    const due = await env.DB.prepare(`SELECT id FROM stores WHERE active = 1 AND welcome_enabled = 1 AND welcome_next_check_at IS NOT NULL AND welcome_next_check_at <= ? ORDER BY welcome_next_check_at LIMIT 2`).bind(iso(Date.now())).all();
    for (const row of due.results || []) {
      try { await processCompany(env, row.id); }
      catch { await status(env, row.id, 'retry', 'No pudimos completar la verificación. Se reintentará.', 300000); }
    }
    await env.DB.prepare('UPDATE company_invitations SET encrypted_payload = NULL WHERE expires_at <= ? AND encrypted_payload IS NOT NULL').bind(iso(Date.now())).run();
  }

  async function manageWelcome(request, env, id) {
    const operator = await requireAdmin(request, env, 'platform:manage');
    if (!operator) return publicJson(request, env, { error:'No autorizado.' }, 401);
    const company = await loadCompany(env, id);
    if (!company?.welcome_enabled) return publicJson(request, env, { error:'Esta empresa no tiene una bienvenida automática programada.' }, 409);
    let body;
    try { body = await readJson(request); } catch { return publicJson(request, env, { error:'Solicitud inválida.' }, 400); }
    if (body.resend === true) {
      const invitation = await env.DB.prepare('SELECT * FROM company_invitations WHERE store_id = ?').bind(id).first();
      const profile = await env.DB.prepare('SELECT must_change_password FROM admin_profiles WHERE id = ? AND store_id = ? AND active = 1').bind(company.initial_admin_profile_id, id).first();
      if (invitation?.used_at || !profile?.must_change_password) return publicJson(request, env, { error:'El usuario ya activó su acceso o no está disponible.' }, 409);
      if (invitation && (Date.parse(invitation.created_at) > Date.now() - 60000 || (invitation.lease_until && Date.parse(invitation.lease_until) > Date.now()))) return publicJson(request, env, { error:'Hay un envío reciente o en curso. Esperá un minuto.' }, 429);
      // Never remove a row leased by an automatic sender racing this request.
      if (invitation) {
        const deleted = await env.DB.prepare('DELETE FROM company_invitations WHERE id = ? AND used_at IS NULL AND (lease_until IS NULL OR lease_until < ?)').bind(invitation.id, iso(Date.now())).run();
        if (!deleted.meta.changes) return publicJson(request, env, { error:'El estado cambió. Actualizá la pantalla.' }, 409);
      }
      await audit(env, operator, 'company.welcome.resend', 'store', id, {});
    }
    return publicJson(request, env, { ok:true, welcome:await processCompany(env, id) });
  }

  async function lookupInvitation(env, token) {
    if (!/^[a-zA-Z0-9_-]{43}$/.test(String(token || ''))) return null;
    return env.DB.prepare(`SELECT i.*, p.username, p.name AS profile_name, p.password_salt, s.name AS company_name, s.public_host
      FROM company_invitations i JOIN admin_profiles p ON p.id = i.profile_id JOIN stores s ON s.id = i.store_id
      WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ? AND i.status IN ('sending','retry','sent')
      AND p.active = 1 AND p.must_change_password = 1 AND p.store_id = i.store_id AND p.store_id != 'platform'
      AND p.email = i.email AND p.password_hash = i.expected_password_hash AND s.active = 1 AND s.setup_status = 'activo'`)
      .bind(await sha256(token), iso(Date.now())).first();
  }

  async function invitationInfo(request, env) {
    let body;
    try { body = await readJson(request); } catch { return publicJson(request, env, { error:'Solicitud inválida.' }, 400); }
    const row = await lookupInvitation(env, body.token);
    if (!row) return publicJson(request, env, { error:'El enlace venció, ya fue utilizado o dejó de ser válido. Pedí una nueva invitación a Restia.' }, 410);
    return publicJson(request, env, { username:row.username, company:row.company_name, passwordSalt:row.password_salt, iterations:120000 });
  }

  async function activate(request, env) {
    let body;
    try { body = await readJson(request); } catch { return publicJson(request, env, { error:'Solicitud inválida.' }, 400); }
    const row = await lookupInvitation(env, body.token);
    if (!row) return publicJson(request, env, { error:'El enlace venció, ya fue utilizado o dejó de ser válido.' }, 410);
    if (!validCredentialMaterial(body.passwordVerifier, body.passwordSalt) || !validCredentialMaterial(body.comparisonVerifier, row.password_salt)) return publicJson(request, env, { error:'No pudimos proteger la contraseña.' }, 400);
    if (await credentialDigest(env, body.comparisonVerifier, row.password_salt) === row.expected_password_hash) return publicJson(request, env, { error:'Elegí una contraseña diferente de la inicial.' }, 409);
    const record = await verifierRecord(env, body.passwordVerifier, body.passwordSalt);
    const now = iso(Date.now()), nonce = crypto.randomUUID();
    // D1 batch is a transaction. The guarded profile update permits exactly one redemption.
    const result = await env.DB.batch([
      env.DB.prepare(`UPDATE admin_profiles SET password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL, updated_at = ?
        WHERE id = ? AND active = 1 AND must_change_password = 1 AND password_hash = ? AND email = ? AND store_id = ?
        AND EXISTS (SELECT 1 FROM company_invitations i JOIN stores s ON s.id = i.store_id WHERE i.id = ? AND i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ? AND i.status IN ('sending','retry','sent') AND s.active = 1 AND s.setup_status = 'activo')`)
        .bind(record.hash, record.salt, record.iterations, now, row.profile_id, row.expected_password_hash, row.email, row.store_id, row.id, row.token_hash, now),
      env.DB.prepare("UPDATE company_invitations SET used_at = ?, consumed_nonce = ?, status = 'used', encrypted_payload = NULL WHERE id = ? AND used_at IS NULL AND changes() = 1").bind(now, nonce, row.id),
      env.DB.prepare('DELETE FROM admin_sessions WHERE profile_id = ? AND EXISTS (SELECT 1 FROM company_invitations WHERE id = ? AND consumed_nonce = ?)').bind(row.profile_id, row.id, nonce),
      env.DB.prepare("UPDATE stores SET welcome_status = 'activated', welcome_error = NULL, welcome_next_check_at = NULL WHERE id = ? AND EXISTS (SELECT 1 FROM company_invitations WHERE id = ? AND consumed_nonce = ?)").bind(row.store_id, row.id, nonce)
    ]);
    if (!result[0]?.meta.changes) return publicJson(request, env, { error:'El enlace ya fue utilizado o dejó de ser válido.' }, 410);
    return publicJson(request, env, { ok:true, username:row.username, panelUrl:`https://${row.public_host}/admin/` });
  }

  return { processCompany, processPending, manageWelcome, invitationInfo, activate, configured };
}
