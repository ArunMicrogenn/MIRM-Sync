/**
 * MICROGENN MIRM Sync Unit - Windows Service Installer
 * Installs mirm-sync.js as a native Windows Service in services.msc.
 *
 * Usage: Open PowerShell or Command Prompt as Administrator and run:
 *   node install-service.js
 */

const path = require('path');
const { Service } = require('node-windows');

// Create a new service object
const svc = new Service({
  name: 'MicroGennMirmSync',
  description: 'MICROGENN IRM/MHMS PMS Node.js Synchronization Unit - Automatically synchronizes offline bookings, inventory chart datewise, and acknowledgements with IRM Cloud.',
  script: path.join(__dirname, 'mirm-sync.js'),
  nodeOptions: [
    '--max-old-space-size=512'
  ],
  workingDirectory: __dirname,
  env: [
    {
      name: 'NODE_ENV',
      value: 'production'
    }
  ],
  // Restart policy on failure
  abortOnError: false,
  grow: 0.25,
  wait: 5,
  maxRestarts: 20
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install', function () {
  console.log('\n======================================================');
  console.log(' MICROGENN MIRM Sync Service Installed Successfully! ');
  console.log('======================================================');
  console.log('Service Name: MicroGennMirmSync');
  console.log('Starting service now...\n');
  svc.start();
});

svc.on('alreadyinstalled', function () {
  console.log('\n[INFO] MicroGennMirmSync service is already installed.');
  console.log('To reinstall, first run: node uninstall-service.js\n');
});

svc.on('start', function () {
  console.log('[SUCCESS] MicroGennMirmSync service is now RUNNING in the background.');
  console.log('It will start automatically on Windows boot (even before user login).');
  console.log('You can check status in Windows Services (Run -> services.msc).\n');
});

svc.on('error', function (err) {
  console.error('[ERROR] Windows Service operation failed:', err);
});

console.log('Registering MicroGennMirmSync with Windows Service Control Manager...');
svc.install();
