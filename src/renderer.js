// renderer.js
const $body = document.getElementById('tbl-body');
const $vacio = document.getElementById('vacio');
const $estado = document.getElementById('filtro-estado');
const $buscar = document.getElementById('buscar');
const $btnRef = document.getElementById('btn-refrescar');
const $btnCfg = document.getElementById('btn-config');

// Modal Pedido
const $modal  = document.getElementById('modal');
const $mTitle = document.getElementById('m-title');
const $mBody  = document.getElementById('m-body');
const $mClose = document.getElementById('m-close');
const $mPrint = document.getElementById('m-print');

// Modal Config
const $cfg = document.getElementById('cfg');
const $cfgClose  = document.getElementById('cfg-close');
const $cfgCancel = document.getElementById('cfg-cancel');
const $cfgSave   = document.getElementById('cfg-save');
const $cfgTest   = document.getElementById('cfg-test');

const $cfgUrl  = document.getElementById('cfg-url');
const $cfgCk   = document.getElementById('cfg-ck');
const $cfgCs   = document.getElementById('cfg-cs');
const $cfgType = document.getElementById('cfg-type');
const $cfgHost = document.getElementById('cfg-host');
const $cfgPort = document.getElementById('cfg-port');
const $cfgWidth= document.getElementById('cfg-width');
const $cfgNeg  = document.getElementById('cfg-negocio');
const $cfgCiu  = document.getElementById('cfg-ciudad');
const $cfgPie  = document.getElementById('cfg-pie');

const $netFields = document.getElementById('net-fields');
const $usbFields = document.getElementById('usb-fields');
const $winFields = document.getElementById('win-fields');
const $cfgScanUsb = document.getElementById('cfg-scan-usb');
const $cfgUsbList = document.getElementById('cfg-usb-list');
const $cfgScanWin = document.getElementById('cfg-scan-win');
const $cfgWinList = document.getElementById('cfg-win-list');

// Apariencia y UI
const $cfgTheme = document.getElementById('cfg-theme');
const $customBox = document.getElementById('custom-colors');
const $cBG = document.getElementById('cfg-c-bg');
const $cPanel = document.getElementById('cfg-c-panel');
const $cText = document.getElementById('cfg-c-text');
const $cMuted = document.getElementById('cfg-c-muted');
const $cAccent = document.getElementById('cfg-c-accent');
const $cBorder = document.getElementById('cfg-c-border');
const $cTop1 = document.getElementById('cfg-c-topbar1');
const $cTop2 = document.getElementById('cfg-c-topbar2');
const $cRow  = document.getElementById('cfg-c-row');

const $cfgAuto = document.getElementById('cfg-auto');
const $cfgInterval = document.getElementById('cfg-interval');
const $cfgAlarm = document.getElementById('cfg-alarm');
const $cfgSound = document.getElementById('cfg-sound');
const $cfgSoundTest = document.getElementById('cfg-sound-test');
const $cfgPerPage = document.getElementById('cfg-perpage');

// Alarm overlay
const $alarm = document.getElementById('alarm');
const $alarmStop = document.getElementById('alarm-stop');
const $alarmAccept = document.getElementById('alarm-accept');
const $alarmList = document.getElementById('alarm-list');

let datos = [];
let currentCfg = null;
let autoT = null;
let newOrderIds = [];
let ackAccepted = {}; // { id: true }

/* ======= Mapeo de estados (App ↔ Woo) ======= */
const STATUS_MAP = {
  nuevo:       { label: 'Nuevo pedido', wc: 'pending'    },
  aceptado:    { label: 'Aceptado',     wc: 'on-hold'    },
  pagado:      { label: 'Pagado',       wc: 'processing' },
  enviado:     { label: 'Enviado',      wc: 'completed'  },
  completado:  { label: 'Completado',   wc: 'completed'  }
};
const APP_KEYS = ['nuevo','aceptado','pagado','enviado','completado'];

function wcToAppStatus(wc, id){
  // Si NO está aceptado localmente → mostrar "Nuevo" aunque Woo diga on-hold/processing
  if (!ackAccepted[id]) return 'nuevo';
  if (wc === 'completed') return 'completado';
  if (wc === 'processing') return 'pagado';
  if (wc === 'on-hold') return 'aceptado';
  if (wc === 'pending') return 'nuevo';
  return wc;
}
function appToWc(app){ return (STATUS_MAP[app]?.wc) || 'processing'; }
function labelStatus(appKey){ return STATUS_MAP[appKey]?.label || appKey || '—'; }

/* ========= TH E M E ========= */
function setThemeVars(vars){
  const root = document.documentElement;
  Object.entries(vars).forEach(([k,v])=>{
    if (v==null) return;
    root.style.setProperty(`--${k}`, v);
  });
}
function applyTheme(ui){
  const body = document.body;
  const theme = ui?.theme || 'dark';
  body.setAttribute('data-theme', theme);
  if (theme === 'custom'){
    const ct = ui.customTheme || {};
    setThemeVars({
      bg:ct.bg, panel:ct.panel, text:ct.text, muted:ct.muted, accent:ct.accent,
      border:ct.border, topbar1:ct.topbar1, topbar2:ct.topbar2, rowHover:ct.rowHover
    });
  }
}
function toggleCustomPanel(){ $customBox.hidden = $cfgTheme.value !== 'custom'; }

/* ========= util ========= */
function money(n){
  try { return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n||0); }
  catch { return `$ ${Number(n||0).toFixed(2)}`; }
}

/* ======== alarma sonora (más fuerte + pre-escucha) ======== */
let AC=null, OSC=null, GAIN=null, soundTimer=null;
function stopTimers(){ if (soundTimer){ clearInterval(soundTimer); soundTimer=null; } }
function alarmStop(){
  stopTimers();
  if (OSC){ try{OSC.stop();}catch(_){}; try{OSC.disconnect();}catch(_){}; OSC=null; }
  if (GAIN){ try{GAIN.disconnect();}catch(_){}; GAIN=null; }
  $alarm.hidden = true;
}
$alarmStop.addEventListener('click', ()=>{ alarmStop(); });

function makeAudio(){
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  OSC = AC.createOscillator();
  GAIN = AC.createGain();
  OSC.connect(GAIN); GAIN.connect(AC.destination);
  GAIN.gain.value = 0.0;
  OSC.start();
}
function pulse(freq, len=0.2, vol=0.18){ // subí volumen
  const t0 = AC.currentTime;
  OSC.frequency.setValueAtTime(freq, t0);
  GAIN.gain.cancelScheduledValues(t0);
  GAIN.gain.setValueAtTime(0.0001, t0);
  GAIN.gain.exponentialRampToValueAtTime(vol, t0+0.02);
  GAIN.gain.exponentialRampToValueAtTime(0.0001, t0+len);
}
function playPattern(sound){
  stopTimers();
  makeAudio();
  switch (sound){
    case 'campana':
      soundTimer = setInterval(()=>{ pulse(1200,.18,.20); setTimeout(()=>pulse(700,.26,.14),160); }, 600);
      break;
    case 'sirena':
      OSC.type = 'sawtooth';
      soundTimer = setInterval(()=>{
        const t = AC.currentTime;
        OSC.frequency.setValueAtTime(600, t);
        OSC.frequency.linearRampToValueAtTime(1200, t+0.45);
        GAIN.gain.setValueAtTime(0.12, t);
        GAIN.gain.linearRampToValueAtTime(0.12, t+0.45);
        GAIN.gain.setValueAtTime(0.0, t+0.5);
      }, 520);
      break;
    case 'timbre':
      OSC.type = 'square';
      soundTimer = setInterval(()=>{
        pulse(700,.10,.16); setTimeout(()=>pulse(700,.10,.16), 130); setTimeout(()=>pulse(700,.10,.16), 260);
      }, 900);
      break;
    case 'pop':
      OSC.type = 'triangle';
      soundTimer = setInterval(()=>{
        pulse(320,.06,.20); setTimeout(()=>pulse(220,.06,.18), 90);
      }, 520);
      break;
    case 'radar':
      OSC.type = 'sine';
      soundTimer = setInterval(()=>{
        const t = AC.currentTime;
        OSC.frequency.setValueAtTime(1000, t);
        GAIN.gain.setValueAtTime(0.0001, t);
        GAIN.gain.exponentialRampToValueAtTime(0.16, t+0.03);
        GAIN.gain.exponentialRampToValueAtTime(0.0001, t+0.6);
      }, 800);
      break;
    default: // beep
      OSC.type = 'sine';
      soundTimer = setInterval(()=>{ pulse(880,.14,.18); setTimeout(()=>pulse(880,.14,.18), 180); }, 650);
  }
}

// pre-escucha
$cfgSoundTest.addEventListener('click', ()=>{
  alarmStop();
  makeAudio();
  playPattern($cfgSound.value);
  setTimeout(()=>alarmStop(), 3000);
});

/* ======== UI alarma ======== */
function buildAlarmList(ids){
  if (!ids || !ids.length){ $alarmList.textContent = ''; return; }
  const lines = ids.map(id=>{
    const d = datos.find(x=>x.id===id);
    const who = d ? (d.customer || '') : '';
    return `#${id} — ${who}`;
  });
  $alarmList.textContent = lines.join('\n');
}
$alarmAccept.addEventListener('click', async ()=>{
  // aceptar TODOS los nuevos → on-hold en Woo + marcar localmente
  const ids = [...newOrderIds];
  if (!ids.length){ alarmStop(); return; }
  for (const id of ids){
    try {
      const row = datos.find(x=>x.id===id);
      const target = row && row.status === 'processing' ? 'processing' : 'on-hold';
      await window.api.updateOrderStatus(id, target);
      ackAccepted[id] = true;
    } catch(_) {}
  }
  await window.api.markAccepted(ids, true);
  newOrderIds = [];
  alarmStop();
  render();
});
function alarmStart(mode, sound, ids){
  newOrderIds = ids || [];
  buildAlarmList(newOrderIds);
  $alarm.hidden = false;
  playPattern(sound);
  if (mode==='3s' || mode==='5s'){
    setTimeout(()=>{ alarmStop(); $alarm.hidden=false; }, mode==='3s'?3000:5000);
  }
}

/* ======== render ======== */
function render(){
  const q = ($buscar.value || '').toLowerCase().trim();
  const stFilter = $estado.value;

  const filtrados = datos.filter(d => {
    const appSt = wcToAppStatus(d.status, d.id);
    const okSt = stFilter === 'all' ? true : appSt === stFilter;
    const okQ = !q || (String(d.id).includes(q) || (d.customer || '').toLowerCase().includes(q));
    return okSt && okQ;
  });

  const y = window.scrollY;
  $body.innerHTML = '';
  if (!filtrados.length){ $vacio.hidden = false; window.scrollTo(0,y); return; }
  $vacio.hidden = true;

  filtrados.forEach(d => {
    const appSt = wcToAppStatus(d.status, d.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${d.id}</td>
      <td>${d.date ? new Date(d.date).toLocaleString('es-AR') : '—'}</td>
      <td>${d.customer}</td>
      <td>${money(d.total)}</td>
      <td>
        <select class="stsel" data-id="${d.id}">
          ${APP_KEYS.map(k => `<option value="${k}" ${appSt===k?'selected':''}>${labelStatus(k)}</option>`).join('')}
        </select>
      </td>
      <td>
        <button data-id="${d.id}" type="button" class="btn btn-ghost btn-sm btn-ver">👁 Ver</button>
        <button data-id="${d.id}" type="button" class="btn btn-success btn-sm btn-print">🖨 Imprimir</button>
      </td>`;
    $body.appendChild(tr);
  });
  window.scrollTo(0,y);
}

async function cargar(playAlarm=true){
  const sel = $estado.value;
  let statuses;
  switch (sel){
    case 'pagado':      statuses = ['processing']; break;
    case 'aceptado':    statuses = ['on-hold'];    break;
    case 'enviado':
    case 'completado':  statuses = ['completed'];  break;
    case 'nuevo':       // nuevo puede venir con cualquier estado; por eso pedimos todos
    default:            statuses = ['processing','on-hold','pending','completed'];
  }
  const perPage = Number(currentCfg?.ui?.perPage || 25);

  const prevIds = new Set(datos.map(x=>x.id));
  const res = await window.api.getOrders({ statuses, perPage });
  if (res && res.error){ alert('Error: ' + res.error); return; }
  datos = Array.isArray(res) ? res : [];

  render();

  if (playAlarm){
    const nuevos = datos.filter(d => !prevIds.has(d.id) || !ackAccepted[d.id]);
    const ids = nuevos.map(n=>n.id).filter(id => !ackAccepted[id]);
    if (ids.length){
      const mode = (currentCfg?.ui?.alarm || 'off');
      const sound= (currentCfg?.ui?.alarmSound || 'beep');
      if (mode !== 'off') alarmStart(mode, sound, ids);
    }
  }
}

/* ======== Detalle modal ======== */
function addr(obj){
  if (!obj) return '—';
  const parts = [obj.address_1, obj.address_2, obj.city, obj.state, obj.postcode].filter(Boolean);
  return parts.join(', ');
}
function itemRows(items){
  return (items || []).map(it => `
    <tr>
      <td>${it.qty}× ${it.name}${it.meta ? `<br><small style="color:var(--muted)">${it.meta}</small>` : ''}</td>
      <td style="text-align:right">${money(it.total)}</td>
    </tr>
  `).join('');
}
async function verPedido(id){
  const o = await window.api.getOrder(Number(id));
  if (o && o.error){ alert('Error: ' + o.error); return; }

  const dispStatus = labelStatus(wcToAppStatus(o.status, o.id));
  $mTitle.textContent = `Pedido #${o.id} — ${o.customer}`;
  $mBody.innerHTML = `
    <div class="grid2">
      <div class="box">
        <h3>Cliente</h3>
        <div>${o.customer}</div>
        <div><small>${o.date ? new Date(o.date).toLocaleString('es-AR') : ''}</small></div>
      </div>
      <div class="box">
        <h3>Pago / Estado</h3>
        <div>Pago: ${o.payment || '—'}</div>
        <div>Estado: ${dispStatus}</div>
      </div>
      <div class="box">
        <h3>Facturación</h3>
        <div>${addr(o.billing)}</div>
      </div>
      <div class="box">
        <h3>Envío</h3>
        <div>${addr(o.shipping) || addr(o.billing)}</div>
      </div>
    </div>
    <div class="box" style="margin-top:12px">
      <table class="table">
        <thead><tr><th>Ítem</th><th style="text-align:right">Importe</th></tr></thead>
        <tbody>${itemRows(o.items)}</tbody>
      </table>
      <div class="row" style="justify-content:flex-end; gap:24px; padding:8px 4px;">
        <div>Envío: <strong>${money(o.shipping_total)}</strong></div>
        ${o.total_tax ? `<div>Impuestos: <strong>${money(o.total_tax)}</strong></div>` : ``}
        <div>Total: <strong>${money(o.total)}</strong></div>
      </div>
    </div>
  `;

  $mPrint.onclick = async () => {
    const r = await window.api.printOrder(o.id);
    if (r && r.error) alert('Error al imprimir: ' + r.error);
    else alert('Enviado a la impresora ✔');
  };

  $modal.hidden = false;
}

/* ======== Config ======== */
function tickStatuses(list){
  const boxes = document.querySelectorAll('input[name="st"]');
  boxes.forEach(b => b.checked = !!(list || []).includes(b.value));
}
function togglePrinterFields(){
  const t = $cfgType.value;
  $usbFields.hidden = t !== 'usb';
  $netFields.hidden = t !== 'network';
  $winFields.hidden = t !== 'winspool';
}
async function scanUsb(){
  $cfgUsbList.innerHTML = `<option value="">Buscando…</option>`;
  const res = await window.api.listUsbPrinters();
  if (res && res.error){ alert('Error listando USB: ' + res.error); return; }
  const list = Array.isArray(res) ? res : [];
  if (!list.length){ $cfgUsbList.innerHTML = `<option value="">No se detectaron impresoras USB</option>`; return; }
  $cfgUsbList.innerHTML = `<option value="">— Seleccioná —</option>` + list.map(p => {
    const val = `${p.vendorId}|${p.productId}`;
    const label = `${p.vendorId}:${p.productId}`;
    return `<option value="${val}">${label}</option>`;
  }).join('');
}
async function scanWin(){
  $cfgWinList.innerHTML = `<option value="">Buscando…</option>`;
  const res = await window.api.listSystemPrinters();
  const list = Array.isArray(res) ? res : [];
  if (!list.length){ $cfgWinList.innerHTML = `<option value="">No hay impresoras</option>`; return; }
  $cfgWinList.innerHTML = `<option value="">— Seleccioná —</option>` + list.map(p => `<option>${p.name}</option>`).join('');
}

function fillThemeControls(ui){
  const ct = (ui.customTheme)||{};
  $cfgTheme.value = ui.theme || 'dark';
  $cBG.value = ct.bg || '#0e1015';
  $cPanel.value = ct.panel || '#151a22';
  $cText.value = ct.text || '#e8ebf1';
  $cMuted.value = ct.muted || '#a9b2c3';
  $cAccent.value = ct.accent || '#6aa8ff';
  $cBorder.value = ct.border || '#232735';
  $cTop1.value = ct.topbar1 || '#0f131b';
  $cTop2.value = ct.topbar2 || '#0d1118';
  $cRow.value  = ct.rowHover || '#121824';
  toggleCustomPanel();
}
function readCustomTheme(){
  return {
    bg:$cBG.value, panel:$cPanel.value, text:$cText.value, muted:$cMuted.value, accent:$cAccent.value,
    border:$cBorder.value, topbar1:$cTop1.value, topbar2:$cTop2.value, rowHover:$cRow.value
  };
}

async function abrirConfig(){
  currentCfg = await window.api.getConfig();
  const ack = await window.api.getAcks();
  ackAccepted = (ack && ack.accepted) ? ack.accepted : {};

  if (!currentCfg) currentCfg = {};
  const wc = currentCfg.wc || {};
  const pr = currentCfg.printer || {};
  const ui = currentCfg.ui || {};

  $cfgUrl.value  = wc.url || '';
  $cfgCk.value   = wc.ck  || '';
  $cfgCs.value   = wc.cs  || '';
  tickStatuses(wc.statuses || ['processing','on-hold','pending','completed']);

  $cfgType.value = pr.type || 'network';
  $cfgHost.value = pr.host || '';
  $cfgPort.value = pr.port || 9100;
  $cfgWidth.value= pr.width || 32;
  $cfgNeg.value  = pr.negocio || 'Mi Negocio';
  $cfgCiu.value  = pr.ciudad  || '';
  $cfgPie.value  = pr.pie     || '';

  $cfgAuto.checked = !!(ui.auto ?? true);
  $cfgInterval.value = String(ui.interval || 30);
  $cfgAlarm.value = ui.alarm || 'until';
  $cfgSound.value = ui.alarmSound || 'beep';
  $cfgPerPage.value = String(ui.perPage || 25);

  fillThemeControls(ui);

  togglePrinterFields();
  if ($cfgType.value === 'usb') await scanUsb();
  if ($cfgType.value === 'winspool') await scanWin();

  applyTheme({ theme:$cfgTheme.value, customTheme: readCustomTheme() });
  $cfg.hidden = false;
}

async function guardarConfig(){
  let usbVid = "", usbPid = "", winPrinterName = "";
  if ($cfgType.value === 'usb'){
    const val = $cfgUsbList.value;
    if (val && val.includes('|')){ const [vid,pid]=val.split('|'); usbVid=vid; usbPid=pid; }
  }
  if ($cfgType.value === 'winspool'){ winPrinterName = $cfgWinList.value || ''; }

  const newCfg = {
    wc: {
      url: $cfgUrl.value.trim(),
      ck:  $cfgCk.value.trim(),
      cs:  $cfgCs.value.trim(),
      statuses: Array.from(document.querySelectorAll('input[name="st"]:checked')).map(b => b.value)
    },
    ui: {
      auto: $cfgAuto.checked,
      interval: Number($cfgInterval.value || 30),
      alarm: $cfgAlarm.value,
      alarmSound: $cfgSound.value,
      theme: $cfgTheme.value,
      perPage: Number($cfgPerPage.value || 25),
      customTheme: readCustomTheme()
    },
    printer: {
      type: $cfgType.value,
      host: $cfgHost.value.trim(),
      port: Number($cfgPort.value || 9100),
      width: Number($cfgWidth.value || 32),
      negocio: $cfgNeg.value.trim(),
      ciudad:  $cfgCiu.value.trim(),
      pie:     $cfgPie.value.trim(),
      usbVid, usbPid, winPrinterName
    }
  };
  const r = await window.api.saveConfig(newCfg);
  if (r && r.error){ alert('Error guardando: ' + r.error); return; }
  $cfg.hidden = true;
  currentCfg = newCfg;
  setupAuto();
  applyTheme(currentCfg.ui);
  await cargar(false);
}

function setupAuto(){
  if (autoT){ clearInterval(autoT); autoT=null; }
  if (currentCfg?.ui?.auto){
    const sec = Math.max(5, Number(currentCfg.ui.interval||30));
    autoT = setInterval(()=>cargar(), sec*1000);
  }
}

/* ======== eventos ======== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.classList.contains('btn-ver'))   { verPedido(btn.getAttribute('data-id')); }
  if (btn.classList.contains('btn-print')) { verPedido(btn.getAttribute('data-id')); }
});

document.addEventListener('change', async (e) => {
  const sel = e.target.closest('select.stsel');
  if (sel){
    const id = Number(sel.getAttribute('data-id'));
    const appSt = sel.value;

    if (appSt === 'nuevo'){
      // volver a "no aceptado" y opcionalmente poner pending
      await window.api.markAccepted([id], false);
      ackAccepted[id] = undefined;
      await window.api.updateOrderStatus(id, 'pending');
    } else {
      await window.api.markAccepted([id], true);
      ackAccepted[id] = true;
      const wcSt = appToWc(appSt);
      const res = await window.api.updateOrderStatus(id, wcSt);
      if (res && res.error){ alert('Error cambiando estado: ' + res.error); }
    }
  }
});

$mClose.addEventListener('click', () => $modal.hidden = true);
$modal.addEventListener('click', (e) => {
  if (e.target === $modal || e.target.classList.contains('modal-backdrop')) $modal.hidden = true;
});

$estado.addEventListener('change', ()=>cargar(false));
$buscar.addEventListener('input', render);
$btnRef.addEventListener('click', ()=>cargar(false));

$btnCfg.addEventListener('click', abrirConfig);
$cfgClose.addEventListener('click', () => $cfg.hidden = true);
$cfgCancel.addEventListener('click', () => $cfg.hidden = true);
$cfgSave.addEventListener('click', guardarConfig);
$cfgTest.addEventListener('click', async ()=> {
  const r = await window.api.testPrint();
  if (r && r.error) alert('Error test print: ' + r.error);
  else alert('Test enviado ✔');
});

$cfgType.addEventListener('change', () => {
  togglePrinterFields();
  if ($cfgType.value === 'usb') scanUsb();
  if ($cfgType.value === 'winspool') scanWin();
});

// Tema en vivo dentro de Config
$cfgTheme.addEventListener('change', ()=>{
  toggleCustomPanel();
  applyTheme({ theme:$cfgTheme.value, customTheme: readCustomTheme() });
});
[$cBG,$cPanel,$cText,$cMuted,$cAccent,$cBorder,$cTop1,$cTop2,$cRow].forEach(el=>{
  el.addEventListener('input', ()=>{
    if ($cfgTheme.value === 'custom'){
      applyTheme({ theme:'custom', customTheme: readCustomTheme() });
    }
  });
});

// Primera carga
(async ()=>{
  currentCfg = await window.api.getConfig();
  const ack = await window.api.getAcks();
  ackAccepted = (ack && ack.accepted) ? ack.accepted : {};
  applyTheme(currentCfg.ui);
  setupAuto();
  cargar(false);
})();
