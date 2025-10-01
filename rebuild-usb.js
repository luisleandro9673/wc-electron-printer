(async () => {
  const { rebuild } = require('@electron/rebuild');
  try {
    await rebuild({
      buildPath: __dirname,
      onlyModules: ['usb', 'printer'],
      force: true
    });
    console.log('Rebuild OK para módulos nativos (usb, printer).');
  } catch (e) {
    console.error('Error en rebuild:', e);
    // no hacemos exit(1): printer es opcional y en Linux puede fallar sin romper la app
  }
})();
