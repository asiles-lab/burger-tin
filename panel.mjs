const config = window.BURGER_TIN_CHECKOUT || {};
const api = String(config.apiBaseUrl || '').replace(/\/$/, '');
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(value);
let token = sessionStorage.getItem('burger-tin-staff-token') || '';
let currentView = 'pending';

async function call(path, options={}) {
  if (!config.enabled || !api.startsWith('https://')) throw new Error('El servidor todavía no está configurado.');
  const response = await fetch(`${api}${path}`, { ...options, headers:{...options.headers,authorization:`Bearer ${token}`} });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
  return result;
}

function statusLabel(order) {
  if (order.status === 'pending_cash') return 'Efectivo · pendiente';
  if (order.status === 'pending_payment') return 'Mercado Pago · esperando pago';
  if (order.status === 'confirmed' && order.print_status === 'printed') return 'Confirmado · impreso';
  if (order.status === 'confirmed') return 'Confirmado · por imprimir';
  return 'Cancelado';
}

function orderActions(order) {
  const actions = [];
  if (order.status === 'pending_cash') actions.push(`<button data-action="confirm" data-code="${escapeHtml(order.code)}">Confirmar e imprimir</button>`);
  if (order.status === 'confirmed') actions.push(`<button class="secondary" data-action="reprint" data-code="${escapeHtml(order.code)}">Reimprimir</button>`);
  if (['pending_cash','pending_payment'].includes(order.status)) actions.push(`<button class="danger" data-action="cancel" data-code="${escapeHtml(order.code)}">Cancelar</button>`);
  return actions.join('');
}

function render(orders) {
  const empty = currentView === 'pending' ? 'No hay pedidos pendientes.' : currentView === 'today' ? 'Todavía no hay pedidos terminados hoy.' : 'No hay pedidos en el historial.';
  const card = order => `<article class="order"><span class="tag">${escapeHtml(statusLabel(order))}</span><h2>${escapeHtml(order.code)}</h2><p><strong>${escapeHtml(order.customer_name)}</strong> · ${order.fulfillment === 'delivery' ? 'Envío' : 'Retiro'}</p><p>${escapeHtml(order.address || '')}</p><p class="total">${money(order.subtotal)}</p><p>${new Date(order.confirmed_at || order.created_at).toLocaleString('es-AR')}</p><footer>${orderActions(order)}</footer></article>`;
  if (!orders.length) { $('#orders').className='orders'; $('#orders').innerHTML=`<p class="empty">${empty}</p>`; return; }
  if (currentView !== 'history') { $('#orders').className='orders'; $('#orders').innerHTML=orders.map(card).join(''); return; }
  const groups = orders.reduce((map, order) => {
    const date = new Date(order.confirmed_at || order.created_at).toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    if(!map.has(date))map.set(date,[]);
    map.get(date).push(order);
    return map;
  },new Map());
  $('#orders').className='history-list';
  $('#orders').innerHTML=[...groups].map(([date, items]) => `<section class="history-day"><h2>${escapeHtml(date)}</h2><div class="orders">${items.map(card).join('')}</div></section>`).join('');
}

function updateCounts(counts={}) {
  $('#count-pending').textContent=Number(counts.pending || 0);
  $('#count-today').textContent=Number(counts.today || 0);
  $('#count-history').textContent=Number(counts.history || 0);
}

function showLoginError(message='') {
  $('#login-error').textContent = message;
}

async function refresh() {
  try { const result=await call(`/api/admin/orders?view=${currentView}`); render(result.orders); updateCounts(result.counts); $('#connection').textContent='Actualizado · '+new Date().toLocaleTimeString('es-AR'); }
  catch(error){ $('#connection').textContent=error.message; if(/autorizado/.test(error.message)) logout('La sesión venció o el token es incorrecto. Volvé a ingresar con el token del local.'); }
}

function showOrders(){ showLoginError(''); $('#login').hidden=true; $('#orders-area').hidden=false; refresh(); }
function logout(message=''){ token='';sessionStorage.removeItem('burger-tin-staff-token');$('#orders-area').hidden=true;$('#login').hidden=false;showLoginError(message); }

$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.currentTarget.querySelector('button');
  token=new FormData(event.currentTarget).get('token').trim();
  showLoginError('');
  button.disabled=true;
  button.textContent='Verificando…';
  try {
    const result=await call('/api/admin/orders');
    sessionStorage.setItem('burger-tin-staff-token',token);
    $('#login').hidden=true;
    $('#orders-area').hidden=false;
    render(result.orders);
    $('#connection').textContent='Actualizado · '+new Date().toLocaleTimeString('es-AR');
  } catch(error) {
    token='';
    sessionStorage.removeItem('burger-tin-staff-token');
    showLoginError(error.message === 'No autorizado.' ? 'Token incorrecto. Usá el token del local, no el token del dispositivo.' : error.message);
  } finally {
    button.disabled=false;
    button.textContent='Ingresar';
  }
});
$('#refresh').addEventListener('click',refresh);
$('#logout').addEventListener('click',logout);
document.querySelector('.views').addEventListener('click',event=>{
  const button=event.target.closest('[data-view]');
  if(!button)return;
  currentView=button.dataset.view;
  document.querySelectorAll('.view').forEach(item=>item.classList.toggle('active',item===button));
  $('#history-tools').hidden=currentView!=='history';
  refresh();
});
$('#clear-history').addEventListener('click',async()=>{
  if(!window.confirm('¿Borrar todos los pedidos terminados y cancelados, y reiniciar la numeración en A-001? Esta acción no se puede deshacer.'))return;
  const button=$('#clear-history');button.disabled=true;
  try{await call('/api/admin/history',{method:'DELETE'});alert('Historial borrado. El próximo pedido será A-001.');await refresh();}
  catch(error){alert(error.message);}
  finally{button.disabled=false;}
});
$('#orders').addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');
  if(!button)return;
  if(button.dataset.action==='cancel' && !window.confirm(`¿Cancelar el pedido ${button.dataset.code}? No se imprimirá ninguna comanda.`))return;
  button.disabled=true;
  try{await call(`/api/admin/orders/${encodeURIComponent(button.dataset.code)}/${button.dataset.action}`,{method:'POST'});await refresh();}
  catch(error){alert(error.message);}
  finally{button.disabled=false;}
});
if(token)showOrders();
setInterval(()=>{if(token)refresh();},15000);
