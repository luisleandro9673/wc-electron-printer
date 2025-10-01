// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;

const escpos = require('escpos');
escpos.Network = require('escpos-network'); // USB se carga on-demand.

let CONFIG_PATH, ACK_PATH;
let config = null;
let acks = { accepted: {} }; // { [orderId]: true }

/* ======================= Config persistente ======================= */
function defaults() {
  return {
    wc: {
      url: process.env.WC_URL || "",
      ck:  process.env.WC_CK  || "",
      cs:  process.env.WC_CS  || "",
      statuses: ['processing','on-hold','pending','completed']
    },
    ui: {
      auto: true,
      interval: 30,
      alarm: 'until',              // off | 3s | 5s | until
      alarmSound: 'beep',          // beep | campana | sirena | timbre | pop | radar
      theme: 'dark',
      perPage: 25,
      customTheme: {
        bg:'#0e1015', panel:'#151a22', text:'#e8ebf1', muted:'#a9b2c3',
        accent:'#6aa8ff', border:'#232735', topbar1:'#0f131b', topbar2:'#0d1118',
        rowHover:'#121824'
      }
    },
    printer: {
      type: (process.platform === 'win32') ? 'winspool' : 'network', // network | usb | winspool
      host: process.env.PRINTER_HOST || "",
      port: parseInt(process.env.PRINTER_PORT || '9100', 10),
      width: parseInt(process.env.TICKET_WIDTH || '32', 10), // 32=58mm, 42=80mm
      negocio: process.env.NEGOCIO || 'Mi Negocio',
      ciudad:  process.env.CIUDAD  || '',
      pie:      process.env.PIE     || '',
      usbVid: "", usbPid: "",
      winPrinterName: ""
    }
  };
}
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const d = defaults();
      config = {
        wc: { ...d.wc, ...(raw.wc||{}) },
        ui: { ...d.ui, ...(raw.ui||{}), customTheme: { ...d.ui.customTheme, ...((raw.ui&&raw.ui.customTheme)||{}) } },
        printer: { ...d.printer, ...(raw.printer||{}) }
      };
    } else {
      config = defaults();
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    }
  } catch (e) {
    console.error('Error cargando config:', e);
    config = defaults();
  }
}
function saveConfig(newCfg){
  const d = defaults();
  config = {
    wc: {
      url: (newCfg.wc?.url || '').trim(),
      ck:  (newCfg.wc?.ck  || '').trim(),
      cs:  (newCfg.wc?.cs  || '').trim(),
      statuses: Array.isArray(newCfg.wc?.statuses) && newCfg.wc.statuses.length
        ? newCfg.wc.statuses.map(String)
        : d.wc.statuses
    },
    ui: {
      auto: !!(newCfg.ui?.auto),
      interval: Math.max(5, parseInt(newCfg.ui?.interval || d.ui.interval, 10)),
      alarm: (['off','3s','5s','until'].includes(newCfg.ui?.alarm)) ? newCfg.ui.alarm : d.ui.alarm,
      alarmSound: (['beep','campana','sirena','timbre','pop','radar'].includes(newCfg.ui?.alarmSound)) ? newCfg.ui.alarmSound : d.ui.alarmSound,
      theme: (['dark','blue','light','custom'].includes(newCfg.ui?.theme)) ? newCfg.ui.theme : d.ui.theme,
      perPage: Math.max(5, parseInt(newCfg.ui?.perPage || d.ui.perPage, 10)),
      customTheme: { ...d.ui.customTheme, ...((newCfg.ui && newCfg.ui.customTheme) || {}) }
    },
    printer: {
      type: (['network','usb','winspool'].includes(newCfg.printer?.type)) ? newCfg.printer.type : d.printer.type,
      host: (newCfg.printer?.host || '').trim(),
      port: parseInt(newCfg.printer?.port || '9100', 10),
      width: parseInt(newCfg.printer?.width || '32', 10),
      negocio: (newCfg.printer?.negocio || '').trim() || 'Mi Negocio',
      ciudad:  (newCfg.printer?.ciudad  || '').trim(),
      pie:     (newCfg.printer?.pie     || '').trim(),
      usbVid:  (newCfg.printer?.usbVid  || '').trim(),
      usbPid:  (newCfg.printer?.usbPid  || '').trim(),
      winPrinterName: (newCfg.printer?.winPrinterName || '').trim()
    }
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/* ======================= Acks (aceptados) ======================= */
function loadAcks(){
  try {
    acks = fs.existsSync(ACK_PATH) ? JSON.parse(fs.readFileSync(ACK_PATH, 'utf8')) : { accepted:{} };
    if (!acks || typeof acks !== 'object') acks = { accepted:{} };
    if (!acks.accepted) acks.accepted = {};
  } catch { acks = { accepted:{} }; }
}
function saveAcks(){
  try { fs.writeFileSync(ACK_PATH, JSON.stringify(acks, null, 2)); } catch(_) {}
}

/* ======================= WooCommerce client ======================= */
function wcClient(){
  if (!config?.wc?.url) throw new Error('Config WooCommerce: falta URL');
  return new WooCommerceRestApi({
    url: config.wc.url,
    consumerKey: config.wc.ck,
    consumerSecret: config.wc.cs,
    version: 'wc/v3',
    queryStringAuth: true,
    timeout: 15000
  });
}

/* ======================= Helpers de texto ======================= */
const W = () => parseInt(config?.printer?.width || 32, 10);
const sep = () => '-'.repeat(W());
const money = (n)=> {
  try { return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(n||0)); }
  catch { return `$ ${Number(n||0).toFixed(2)}`; }
};
const wrap = (s, w=W()) => {
  const out = []; let line = '';
  String(s||'').split(/\s+/).forEach(word => {
    if ((line + ' ' + word).trim().length > w) { out.push(line.trim()); line = word; }
    else { line = (line ? line + ' ' : '') + word; }
  });
  if (line) out.push(line.trim());
  return out;
};
function leftRight(left, right, width=W()){
  const r = String(right ?? '');
  const space = 1;
  const body = Math.max(0, width - r.length - space);
  const ll = wrap(left, body);
  if (ll.length === 0) return r.padStart(width);
  const lines = ll.map((ln,i) => {
    if (i === ll.length-1) return ln + ' '.repeat(space + Math.max(0, body - ln.length)) + r;
    return ln;
  });
  return lines.join('\n');
}
function decodeEntities(str){
  let s = String(str||'');
  s = s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
       .replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
  s = s.replace(/&#(\d+);/g, (_,d)=> String.fromCharCode(parseInt(d,10)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_,h)=> String.fromCharCode(parseInt(h,16)));
  s = s.replace(/<[^>]+>/g,'');
  return s;
}
function normKey(s){
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim();
}
function splitListPreservingParens(text){
  const t = String(text||''); const parts=[]; let buf=''; let d=0;
  for (let i=0;i<t.length;i++){
    const ch=t[i];
    if (ch==='('){ d++; buf+=ch; continue; }
    if (ch===')'){ if(d>0)d--; buf+=ch; continue; }
    if (ch===',' && d===0){ const s=buf.trim(); if(s) parts.push(s); buf=''; continue; }
    buf+=ch;
  }
  const s=buf.trim(); if(s) parts.push(s);
  return parts;
}
function inferType(labelNorm){
  if (/(adicional|adicionales|extra|extras|sabor|sabores|gusto|gustos|agregado|agregados)/.test(labelNorm)) return 'additional';
  if (/(opcional|opcionales|salsa|salsas|topping|toppings|cobertura|coberturas)/.test(labelNorm)) return 'optional';
  return '';
}

/* ======== Extras estilo WhatsApp (sin encabezados “Adicionales/Opcionales”) ======== */
const BULLET = '-';
function buildExtrasLines(metaData){
  const groups = {}; // label => [bullets]
  const others = [];

  const pairs = [];
  (metaData||[]).forEach(m => {
    const k = decodeEntities(m.display_key ?? m.key ?? '');
    let v = m.display_value ?? m.value ?? '';
    if (v && typeof v !== 'string') v = String(v);
    v = decodeEntities(v).replace(/[\r\n]+/g,' ').trim();
    if (!k || k[0]==='_') return;
    if (!v) return;
    pairs.push([k,v]);
  });

  pairs.forEach(([k,v])=>{
    const parts = splitListPreservingParens(v);
    const bullets = (parts.length?parts:[v]).map(p => '  ' + BULLET + ' ' + p.trim().replace(/\s*×\s*/g,' x '));
    const nk = normKey(k);
    const type = inferType(nk);
    if (!groups[k]) groups[k] = [];
    groups[k].push(...bullets);
    if (!type && bullets.length === 1) others.push('  ' + BULLET + ' ' + k + ': ' + parts[0]);
  });

  const keys = Object.keys(groups);
  keys.sort((a,b)=>{
    const aa=normKey(a), bb=normKey(b);
    const prio = s => (s==='salsas'?0 : (/^sabores?$|^gustos?$/.test(s)?1:9));
    const pa = prio(aa), pb = prio(bb);
    return pa!==pb ? pa-pb : 0;
  });

  const out = [];
  keys.forEach((label,i)=>{
    out.push('' + label);
    out.push(...groups[label]);
    if (i<keys.length-1) out.push('');
  });
  if (others.length){
    if (out.length) out.push('');
    out.push(...others);
  }
  return out;
}

/* ======================= Ticket ======================= */
function formatAddress(ship, bill){
  const s = ship || {}; const b = bill || {};
  const addr1 = (s.address_1 || b.address_1 || '').trim();
  const addr2 = (s.address_2 || b.address_2 || '').trim();
  const city  = (s.city || b.city || '').trim();
  const state = (s.state || b.state || '').trim();
  const zip   = (s.postcode || b.postcode || '').trim();
  const parts = [addr1 + (addr2 ? ' ' + addr2 : ''), city, state, zip].filter(Boolean);
  return parts.join(', ');
}
function getPhone(ship, bill){
  return (ship && ship.phone) ? String(ship.phone) : (bill && bill.phone ? String(bill.phone) : '');
}

function buildTicket(o){
  const lines = [];
  const fecha = o.date ? new Date(o.date).toLocaleString('es-AR') : '';
  const NEGOCIO = config.printer.negocio;
  const CIUDAD  = config.printer.ciudad;
  const PIE     = config.printer.pie;

  lines.push(NEGOCIO);
  if (CIUDAD) lines.push(`(${CIUDAD})`);
  lines.push(`Pedido #${o.id}`);
  if (fecha) lines.push(fecha);
  lines.push(sep());

  const customer = o.customer || '—';
  const phone = getPhone(o.shipping, o.billing);
  const direccion = formatAddress(o.shipping, o.billing);
  lines.push(`Cliente: ${customer}`);
  if (phone) lines.push(`Tel: ${phone}`);
  if (direccion) wrap(`Dirección: ${direccion}`, W()).forEach(l => lines.push(l));
  lines.push(sep());

  lines.push('Items:');
  (o.items || []).forEach(it => {
    lines.push(leftRight(`${it.qty} x ${decodeEntities(it.name)}`, money(it.total)));
    const extraLines = buildExtrasLines(it.meta_data || []);
    if (extraLines.length){
      extraLines.forEach(raw => {
        if (raw.trim() === '') { lines.push(''); return; }
        const cleaned = decodeEntities(raw).replace(/\s*×\s*/g,' x ');
        wrap(cleaned, W()).forEach(w => lines.push(w));
      });
    }
    lines.push(sep());
  });

  if (o.shipping_total) lines.push(leftRight('Envío', money(o.shipping_total)));
  if (o.total_tax)     lines.push(leftRight('Impuestos', money(o.total_tax)));
  lines.push(leftRight('TOTAL', money(o.total)));

  if (o.payment) { lines.push(sep()); lines.push(`Pago: ${decodeEntities(o.payment)}`); }
  if (PIE) { lines.push(sep()); wrap(PIE, W()).forEach(l => lines.push(l)); }

  return lines.join('\n');
}

/* ====== Impresión: USB/Red/Windows spool ====== */
function getDevice(){
  if (config.printer.type === 'usb'){
    let escposUSB;
    try {
      escposUSB = require('escpos-usb');
      escpos.USB = escposUSB;
    } catch (e) {
      throw new Error('escpos-usb no instalado o sin permisos. Instalá: npm i escpos-usb');
    }
    const vidStr = (config.printer.usbVid || '').toString();
    const pidStr = (config.printer.usbPid || '').toString();
    let device;
    try {
      if (vidStr && pidStr) {
        const v = parseInt(vidStr, 16);
        const p = parseInt(pidStr, 16);
        device = new escpos.USB(v, p);
      } else {
        device = new escpos.USB();
      }
    } catch (e){
      throw new Error('No se pudo abrir la impresora USB (revisá VID/PID y permisos udev).');
    }
    return device;
  }
  if (config.printer.type === 'network'){
    if (!config.printer.host) throw new Error('Config impresora: falta host/IP');
    const port = parseInt(config.printer.port || 9100, 10);
    return new escpos.Network(config.printer.host, port);
  }
  return null; // winspool no usa device
}

function printText(text){
  // Windows spooler
  if (config.printer.type === 'winspool'){
    const name = (config.printer.winPrinterName || '').trim();
    if (!name) return Promise.reject(new Error('Seleccioná una impresora de Windows en Config.'));
    let printerLib;
    try { printerLib = require('printer'); }
    catch { return Promise.reject(new Error('El módulo "printer" no está disponible en este sistema.')); }
    const iconv = require('iconv-lite');
    const data = iconv.encode(text + '\n', 'cp858');
    const cut  = Buffer.from([0x1d,0x56,0x42,0x00]);
    const buf  = Buffer.concat([data, cut]);
    return new Promise((resolve, reject) => {
      printerLib.printDirect({
        data: buf, printer: name, type: 'RAW',
        success: () => resolve(), error: (e) => reject(e)
      });
    });
  }

  // USB / Red con escpos
  return new Promise((resolve, reject) => {
    try {
      const device = getDevice();
      const printer = new escpos.Printer(device, { encoding: 'CP858' });
      device.open((err) => {
        if (err) return reject(err);
        try {
          printer.encode('CP858');
          const safe = text.replace(/•/g, '-').replace(/\u00D7/g, 'x');
          safe.split('\n').forEach(line => printer.text(line));
          printer.cut();
          printer.close();
          resolve();
        } catch (e) { reject(e); }
      });
    } catch (e) { reject(e); }
  });
}

/* ======================= Ventana ======================= */
function createWindow () {
  const win = new BrowserWindow({
    width: 1100, height: 740,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

/* ======================= IPC ======================= */
ipcMain.handle('get-config', async () => config);
ipcMain.handle('save-config', async (_evt, newCfg) => {
  try { saveConfig(newCfg); return { ok: true }; }
  catch (e){ return { error: e.message || String(e) }; }
});

ipcMain.handle('get-acks', async ()=> acks);
ipcMain.handle('mark-accepted', async (_evt, { ids, on }) => {
  try {
    (ids||[]).forEach(id => {
      if (on) acks.accepted[id] = true; else delete acks.accepted[id];
    });
    saveAcks();
    return { ok:true };
  } catch (e){ return { error: e.message || String(e) }; }
});

ipcMain.handle('test-print', async () => {
  try {
    const demo = [
      config.printer.negocio,
      config.printer.ciudad ? `(${config.printer.ciudad})` : '',
      '-'.repeat(W()),
      'Impresión de prueba',
      'Tel: 299-0000000',
      'Dirección: Calle 123, Ciudad',
      new Date().toLocaleString('es-AR')
    ].filter(Boolean).join('\n');
    await printText(demo);
    return { ok: true };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

// USB disponibles
ipcMain.handle('list-usb-printers', async () => {
  try {
    let list = [];
    try {
      const escposUSB = require('escpos-usb');
      if (escposUSB && typeof escposUSB.findPrinter === 'function') {
        list = escposUSB.findPrinter() || [];
      } else if (escpos.USB && typeof escpos.USB.findPrinter === 'function') {
        list = escpos.USB.findPrinter() || [];
      }
    } catch (_) { /* sin USB */ }
    return (list || []).map(d => {
      const dd = d && d.deviceDescriptor;
      const vid = dd ? '0x' + dd.idVendor.toString(16).padStart(4, '0') : '';
      const pid = dd ? '0x' + dd.idProduct.toString(16).padStart(4, '0') : '';
      return { vendorId: vid, productId: pid };
    });
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

// Impresoras del sistema (Windows)
ipcMain.handle('list-system-printers', async () => {
  try {
    let printers = [];
    try {
      const p = require('printer');
      printers = p.getPrinters() || [];
    } catch (_) { /* módulo no disponible */ }
    return printers.map(x => ({ name: x.name }));
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

// Lista
ipcMain.handle('get-orders', async (_evt, { statuses, perPage = 50 } = {}) => {
  try {
    const wc = wcClient();
    const st = Array.isArray(statuses) && statuses.length ? statuses : (config.wc.statuses || defaults().wc.statuses);
    const params = { status: st, per_page: perPage, order: 'desc', orderby: 'date' };
    const { data } = await wc.get('orders', params);
    return data.map(o => ({
      id: o.id,
      date: o.date_created || o.date_modified,
      customer: [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(' ') || o.billing?.company || '—',
      total: Number(o.total || 0),
      status: o.status
    }));
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

// Detalle
ipcMain.handle('get-order', async (_evt, { id }) => {
  try {
    if (!id) throw new Error('id requerido');
    const wc = wcClient();
    const { data: o } = await wc.get(`orders/${id}`);
    return {
      id: o.id,
      status: o.status,
      date: o.date_created || o.date_modified,
      customer: [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(' ') || o.billing?.company || '—',
      billing: o.billing,
      shipping: o.shipping,
      payment: o.payment_method_title,
      shipping_total: Number(o.shipping_total || 0),
      total_tax: Number(o.total_tax || 0),
      total: Number(o.total || 0),
      items: (o.line_items || []).map(it => ({
        name: it.name,
        qty: it.quantity,
        subtotal: Number(it.subtotal || 0),
        total: Number(it.total || 0),
        meta_data: it.meta_data || []
      }))
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

// Cambiar estado Woo
ipcMain.handle('update-order-status', async (_evt, { id, status }) => {
  try {
    if (!id || !status) throw new Error('id y status requeridos');
    const wc = wcClient();
    const { data } = await wc.put(`orders/${id}`, { status });
    return { ok: true, data };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

// Imprimir pedido
ipcMain.handle('print-order', async (_evt, { id }) => {
  try {
    if (!id) throw new Error('id requerido');
    const wc = wcClient();
    const { data: o } = await wc.get(`orders/${id}`);
    const order = {
      id: o.id,
      date: o.date_created || o.date_modified,
      customer: [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(' ') || o.billing?.company || '—',
      billing: o.billing,
      shipping: o.shipping,
      payment: o.payment_method_title,
      shipping_total: Number(o.shipping_total || 0),
      total_tax: Number(o.total_tax || 0),
      total: Number(o.total || 0),
      items: (o.line_items || []).map(it => ({
        name: it.name,
        qty: it.quantity,
        total: Number(it.total || 0),
        meta_data: it.meta_data || []
      }))
    };
    const ticket = buildTicket(order);
    await printText(ticket);
    return { ok: true };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

/* ======================= App lifecycle ======================= */
app.whenReady().then(() => {
  CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
  ACK_PATH    = path.join(app.getPath('userData'), 'acks.json');
  loadConfig();
  loadAcks();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
