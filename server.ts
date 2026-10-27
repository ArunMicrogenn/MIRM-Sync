/**
 * MIRM Sync Unit - Full-Stack Express Server & Background Daemon
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { syncEngine } from './src/server/services/syncEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Start background scheduler on launch
syncEngine.start();

// API ROUTES
app.get('/api/status', async (_req: Request, res: Response) => {
  try {
    const status = await syncEngine.getStatus();
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync/run', async (_req: Request, res: Response) => {
  try {
    const result = await syncEngine.runSyncPass('manual');
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync/start', (_req: Request, res: Response) => {
  syncEngine.start();
  res.json({ success: true, message: 'Scheduler started' });
});

app.post('/api/sync/stop', (_req: Request, res: Response) => {
  syncEngine.stop();
  res.json({ success: true, message: 'Scheduler paused' });
});

app.get('/api/sync/history', (_req: Request, res: Response) => {
  res.json({ success: true, history: syncEngine.getHistory() });
});

app.get('/api/sync/logs', (_req: Request, res: Response) => {
  res.json({ success: true, logs: syncEngine.getLogs() });
});

app.get('/api/bookings', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const bookings = await syncEngine.getDb().getBookings(limit);
    res.json({ success: true, bookings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/inventory', async (_req: Request, res: Response) => {
  try {
    const rows = await syncEngine.getDb().getAllInventoryRows();
    const pendingCount = await syncEngine.getDb().getPendingInventoryCount();
    res.json({ success: true, rows, pendingCount });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inventory/seed', async (req: Request, res: Response) => {
  try {
    syncEngine.getDb().seedMockInventoryRow(req.body || {});
    syncEngine.addLog('info', 'inventory', 'New pending inventory row seeded for testing.');
    res.json({ success: true, message: 'Sample pending inventory row seeded.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mock/reset', (_req: Request, res: Response) => {
  syncEngine.getDb().resetMockData();
  syncEngine.addLog('info', 'db', 'Mock PMS sample database tables reset to factory state.');
  res.json({ success: true, message: 'Sample PMS database reset.' });
});

app.post('/api/webhook/booking', async (req: Request, res: Response) => {
  try {
    const result = await syncEngine.getBookingService().insertDirectBooking(req.body);
    if (result.success) {
      syncEngine.addLog('success', 'booking', `Direct booking webhook inserted: ${req.body?.booking_reference || 'N/A'}`);
      res.status(200).json(result);
    } else {
      syncEngine.addLog('warn', 'booking', `Direct booking webhook rejected: ${result.error}`);
      res.status(500).json(result);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/config', (_req: Request, res: Response) => {
  res.json({ success: true, config: syncEngine.getConfig() });
});

app.post('/api/config', (req: Request, res: Response) => {
  try {
    syncEngine.updateConfig(req.body);
    res.json({ success: true, config: syncEngine.getConfig() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/standalone/code', (_req: Request, res: Response) => {
  try {
    const standaloneDir = path.join(__dirname, 'src/server/standalone');
    const filesToRead = [
      'install-service.bat',
      'install-service.js',
      'uninstall-service.bat',
      'uninstall-service.js',
      'service-control.bat',
      'mirm-sync.js',
      'package.json',
      '.env.example',
      'winsw-config.xml',
      'README.md',
    ];

    const files: Record<string, string> = {};
    for (const file of filesToRead) {
      const filePath = path.join(standaloneDir, file);
      if (fs.existsSync(filePath)) {
        files[file] = fs.readFileSync(filePath, 'utf-8');
      }
    }

    res.json({
      success: true,
      files,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download Complete Windows Service Package as ZIP
app.get('/api/standalone/download-zip', async (_req: Request, res: Response) => {
  try {
    const standaloneDir = path.join(__dirname, 'src/server/standalone');
    const zip = new JSZip();

    const filesToInclude = [
      'install-service.bat',
      'install-service.js',
      'uninstall-service.bat',
      'uninstall-service.js',
      'service-control.bat',
      'mirm-sync.js',
      'package.json',
      '.env.example',
      'winsw-config.xml',
      'README.md',
    ];

    for (const file of filesToInclude) {
      const filePath = path.join(standaloneDir, file);
      if (fs.existsSync(filePath)) {
        zip.file(file, fs.readFileSync(filePath));
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="microgenn-mirm-sync-windows-service.zip"');
    res.setHeader('Content-Length', zipBuffer.length);
    res.end(zipBuffer);
  } catch (err: any) {
    console.error('Error generating ZIP:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download Individual File
app.get('/api/standalone/download/:filename', (req: Request, res: Response) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(__dirname, 'src/server/standalone', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    res.download(filePath, filename);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

async function bootstrap() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist/index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[MICROGENN MIRM Sync] Node.js Server listening on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('[MICROGENN MIRM Sync] Server bootstrap failure:', err);
});
