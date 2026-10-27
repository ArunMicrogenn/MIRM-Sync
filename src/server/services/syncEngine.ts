/**
 * MIRM Sync Engine & Background Scheduler
 * Replaces PHP's HTTP Refresh header with a resilient Node.js async background engine.
 */

import { AppConfig, config } from '../config.js';
import { DatabaseAdapter, getDatabase, switchDatabaseMode } from '../db/pmsDatabase.js';
import { MirmBookingService } from './mirmBookingService.js';
import { MirmInventoryService } from './mirmInventoryService.js';
import { FullSyncResult, SyncEngineStatus } from '../types.js';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  category: 'booking' | 'inventory' | 'system' | 'db';
  message: string;
  details?: any;
}

export class SyncEngine {
  private db: DatabaseAdapter;
  private bookingService: MirmBookingService;
  private inventoryService: MirmInventoryService;
  private isRunning = false;
  private isSyncInProgress = false;
  private timer: NodeJS.Timeout | null = null;
  private nextRunTimestamp: number = 0;
  private totalRuns = 0;
  private lastResult: FullSyncResult | null = null;
  private history: FullSyncResult[] = [];
  private logs: LogEntry[] = [];
  private currentConfig: AppConfig;

  constructor() {
    this.currentConfig = { ...config };
    this.db = getDatabase(this.currentConfig);
    this.bookingService = new MirmBookingService(this.currentConfig, this.db);
    this.inventoryService = new MirmInventoryService(this.currentConfig, this.db);

    this.addLog('info', 'system', 'MIRM Sync Engine initialized in Node.js runtime.');
  }

  getDb(): DatabaseAdapter {
    return this.db;
  }

  getBookingService(): MirmBookingService {
    return this.bookingService;
  }

  getInventoryService(): MirmInventoryService {
    return this.inventoryService;
  }

  getConfig(): AppConfig {
    return this.currentConfig;
  }

  updateConfig(partial: Partial<AppConfig>) {
    if (partial.db) {
      this.currentConfig.db = { ...this.currentConfig.db, ...partial.db };
    }
    if (partial.irm) {
      this.currentConfig.irm = { ...this.currentConfig.irm, ...partial.irm };
    }

    if (partial.db && partial.db.useMock !== undefined) {
      this.db = switchDatabaseMode(partial.db.useMock, this.currentConfig);
      this.bookingService = new MirmBookingService(this.currentConfig, this.db);
      this.inventoryService = new MirmInventoryService(this.currentConfig, this.db);
      this.addLog('info', 'db', `Database switched to ${partial.db.useMock ? 'Mock In-Memory' : 'Real MSSQL'}.`);
    }

    if (this.isRunning) {
      this.restartScheduler();
    }
  }

  addLog(level: 'info' | 'warn' | 'error' | 'success', category: 'booking' | 'inventory' | 'system' | 'db', message: string, details?: any) {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) {
      this.logs.pop();
    }
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  getHistory(): FullSyncResult[] {
    return this.history;
  }

  async getStatus(): Promise<SyncEngineStatus> {
    const now = Date.now();
    const remainingSeconds = this.isRunning && this.nextRunTimestamp > now ? Math.ceil((this.nextRunTimestamp - now) / 1000) : 0;

    let apiKey = this.currentConfig.irm.fallbackApiKey;
    let apiKeySource: 'database' | 'fallback' | 'environment' = 'fallback';

    try {
      const keyInfo = await this.db.getApiKey();
      apiKey = keyInfo.apiKey;
      apiKeySource = keyInfo.source;
    } catch {
      // fallback
    }

    return {
      isRunning: this.isRunning,
      isSyncInProgress: this.isSyncInProgress,
      lastRunAt: this.lastResult ? this.lastResult.timestamp : null,
      nextRunInSeconds: remainingSeconds,
      intervalSeconds: this.currentConfig.irm.syncIntervalSeconds,
      totalRuns: this.totalRuns,
      dbMode: this.db.isMock ? 'mock' : 'mssql',
      dbConnected: this.db.isConnected,
      dbError: this.db.error,
      resolvedApiKey: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'None',
      apiKeySource,
      lastResult: this.lastResult,
    };
  }

  /**
   * Executes one full synchronization cycle (Bookings fetch + Inventory push)
   * Equivalent to index.php running runMirmSync() and pushRoomInventory()
   */
  async runSyncPass(trigger: 'scheduled' | 'manual' = 'manual'): Promise<FullSyncResult> {
    if (this.isSyncInProgress) {
      this.addLog('warn', 'system', 'Sync pass requested while another pass is still executing. Skipping.');
      if (this.lastResult) return this.lastResult;
    }

    this.isSyncInProgress = true;
    const start = Date.now();
    const syncId = `sync_${Date.now()}`;

    this.addLog('info', 'system', `Starting ${trigger} MIRM synchronization pass #${this.totalRuns + 1}...`);

    try {
      // 1. Run Bookings Sync pass
      const bookingSync = await this.bookingService.runMirmSync();

      if (bookingSync.fetchError) {
        this.addLog('error', 'booking', `Booking sync fetch failed: ${bookingSync.fetchError}`);
      } else {
        this.addLog(
          bookingSync.failed > 0 ? 'warn' : 'success',
          'booking',
          `Bookings pass: ${bookingSync.totalFetched} fetched, ${bookingSync.inserted} inserted, ${bookingSync.failed} failed.`
        );
      }

      // 2. Run Room Inventory Sync pass
      const inventorySync = await this.inventoryService.pushRoomInventory(this.currentConfig.irm.inventoryBatchLimit);

      if (inventorySync.queryError) {
        this.addLog('error', 'inventory', `Inventory query error: ${inventorySync.queryError}`);
      } else {
        this.addLog(
          inventorySync.failed > 0 ? 'warn' : 'success',
          'inventory',
          `Inventory pass: ${inventorySync.processed} processed, ${inventorySync.updated} updated, ${inventorySync.failed} failed (${inventorySync.totalPending} pending total).`
        );
      }

      const totalDuration = Date.now() - start;
      const fullResult: FullSyncResult = {
        id: syncId,
        timestamp: new Date().toISOString(),
        bookingSync,
        inventorySync,
        durationMs: totalDuration,
      };

      this.lastResult = fullResult;
      this.totalRuns++;
      this.history.unshift(fullResult);
      if (this.history.length > 50) {
        this.history.pop();
      }

      this.addLog('success', 'system', `Sync pass completed in ${totalDuration}ms.`);
      return fullResult;
    } catch (err: any) {
      this.addLog('error', 'system', `Unexpected error during sync pass: ${err.message || String(err)}`);
      throw err;
    } finally {
      this.isSyncInProgress = false;
      if (this.isRunning) {
        this.scheduleNext();
      }
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.addLog('info', 'system', `MIRM background scheduler started. Interval: ${this.currentConfig.irm.syncIntervalSeconds}s.`);
    // Run immediate pass on start, then loop
    this.runSyncPass('scheduled');
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.addLog('info', 'system', 'MIRM background scheduler paused.');
  }

  private restartScheduler() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduleNext();
  }

  private scheduleNext() {
    if (!this.isRunning) return;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const intervalMs = this.currentConfig.irm.syncIntervalSeconds * 1000;
    this.nextRunTimestamp = Date.now() + intervalMs;

    this.timer = setTimeout(() => {
      this.runSyncPass('scheduled').catch((err) => {
        console.error('[SyncEngine] Scheduled pass failed:', err);
      });
    }, intervalMs);
  }
}

// Global Singleton Instance
export const syncEngine = new SyncEngine();
