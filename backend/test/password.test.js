import test from 'node:test';
import assert from 'node:assert/strict';
import { changePassword } from '../src/index.js';

const base64 = bytes => Buffer.from(bytes).toString('base64');

async function protectedDigest(secret, salt, verifier) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${salt}.${verifier}`));
  return base64(new Uint8Array(signature));
}

function mockDatabase(profile, currentPassword) {
  let batched = false;
  return {
    get batched() { return batched; },
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => sql.includes('JOIN admin_profiles') ? profile : currentPassword,
            run: async () => ({ meta:{ changes:1 } })
          };
        }
      };
    },
    async batch() { batched = true; return []; }
  };
}

test('rechaza reutilizar la contraseña actual', async () => {
  const secret = 'test-secret';
  const salt = base64(new Uint8Array(16).fill(7));
  const verifier = base64(new Uint8Array(32).fill(9));
  const passwordHash = await protectedDigest(secret, salt, verifier);
  const profile = { id:'profile-1', store_id:'burger-tin', name:'Prueba', email:'test@example.com', username:'prueba', role:'Admin', permissions:'["orders:view"]', must_change_password:1 };
  const DB = mockDatabase(profile, { password_hash:passwordHash, password_salt:salt });
  const request = new Request('https://example.test/api/auth/change-password', { method:'POST', headers:{ authorization:'Bearer session', 'content-type':'application/json' }, body:JSON.stringify({ passwordVerifier:base64(new Uint8Array(32).fill(3)), passwordSalt:base64(new Uint8Array(16).fill(4)), comparisonVerifier:verifier }) });
  const response = await changePassword(request, { DB, SETTINGS_ENCRYPTION_KEY:secret, ALLOWED_ORIGIN:'' });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'La nueva contraseña debe ser diferente de la contraseña actual.');
  assert.equal(DB.batched, false);
});

test('acepta una contraseña nueva diferente', async () => {
  const secret = 'test-secret';
  const salt = base64(new Uint8Array(16).fill(7));
  const oldVerifier = base64(new Uint8Array(32).fill(9));
  const newVerifier = base64(new Uint8Array(32).fill(3));
  const profile = { id:'profile-1', store_id:'platform', name:'Prueba', email:'test@example.com', username:'prueba', role:'Superadmin', permissions:'["platform:manage"]', must_change_password:1 };
  const DB = mockDatabase(profile, { password_hash:await protectedDigest(secret, salt, oldVerifier), password_salt:salt });
  const request = new Request('https://example.test/api/auth/change-password', { method:'POST', headers:{ authorization:'Bearer session', 'content-type':'application/json' }, body:JSON.stringify({ passwordVerifier:newVerifier, passwordSalt:base64(new Uint8Array(16).fill(4)), comparisonVerifier:newVerifier }) });
  const response = await changePassword(request, { DB, SETTINGS_ENCRYPTION_KEY:secret, ALLOWED_ORIGIN:'' });
  assert.equal(response.status, 200);
  assert.equal(DB.batched, true);
});
