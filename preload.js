// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig:        ()       => ipcRenderer.invoke('get-config'),
  saveConfig:       (cfg)    => ipcRenderer.invoke('save-config', cfg),

  // Impresión
  testPrint:        ()       => ipcRenderer.invoke('test-print'),
  printOrder:       (id)     => ipcRenderer.invoke('print-order', { id }),

  // Listados / detalles
  getOrders:        (opts)   => ipcRenderer.invoke('get-orders', opts),
  getOrder:         (id)     => ipcRenderer.invoke('get-order', { id }),

  // Estados WC
  updateOrderStatus:(id, st) => ipcRenderer.invoke('update-order-status', { id, status: st }),

  // Acks (aceptados localmente)
  getAcks:          ()       => ipcRenderer.invoke('get-acks'),
  markAccepted:     (ids, on)=> ipcRenderer.invoke('mark-accepted', { ids, on }),

  // Impresoras
  listUsbPrinters:   ()      => ipcRenderer.invoke('list-usb-printers'),
  listSystemPrinters:()      => ipcRenderer.invoke('list-system-printers')
});
