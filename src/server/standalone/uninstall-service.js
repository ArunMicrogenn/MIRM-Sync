/**
 * MICROGENN MIRM Sync Unit - Windows Service Uninstaller
 * Removes MicroGennMirmSync cleanly from services.msc.
 *
 * Usage: Open PowerShell or Command Prompt as Administrator and run:
 *   node uninstall-service.js
 */

const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'MicroGennMirmSync',
  script: path.join(__dirname, 'mirm-sync.js')
});

svc.on('uninstall', function () {
  console.log('\n======================================================');
  console.log(' MICROGENN MIRM Sync Service Uninstalled Successfully! ');
  console.log('======================================================');
  console.log('The service has been removed from Windows services.msc.\n');
});

svc.on('alreadyuninstalled', function () {
  console.log('\n[INFO] MicroGennMirmSync service is already uninstalled.\n');
});

svc.on('error', function (err) {
  console.error('[ERROR] Uninstall error:', err);
});

console.log('Removing MicroGennMirmSync service from Windows...');
svc.uninstall();
