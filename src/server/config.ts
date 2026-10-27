/**
 * MIRM Sync Unit - Configuration
 * Converted from config.php
 */

import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  db: {
    server: string;
    database: string;
    user: string;
    password: string;
    port: number;
    options: {
      encrypt: boolean;
      trustServerCertificate: boolean;
      enableArithAbort: boolean;
      connectionTimeout: number;
      requestTimeout: number;
    };
    useMock: boolean;
  };
  irm: {
    baseUrl: string;
    fallbackApiKey: string;
    syncIntervalSeconds: number;
    sinceDaysLookback: number;
    bookingBatchLimit: number;
    inventoryBatchLimit: number;
  };
}

export const config: AppConfig = {
  db: {
    server: process.env.IRM_DB_SERVER || 'admin-pc\\sqlexpress',
    database: process.env.IRM_DB_NAME || 'vpi3108',
    user: process.env.IRM_DB_USER || 'sa',
    password: process.env.IRM_DB_PASS || 'mgenn',
    port: parseInt(process.env.IRM_DB_PORT || '1433', 10),
    options: {
      encrypt: process.env.IRM_DB_ENCRYPT === 'true',
      trustServerCertificate: true,
      enableArithAbort: true,
      connectionTimeout: 10000,
      requestTimeout: 30000,
    },
    // Default to mock when running in environments without direct local network access to admin-pc
    useMock: process.env.USE_MOCK_DB !== 'false',
  },
  irm: {
    baseUrl: process.env.IRM_BASE_URL || 'https://irm.mhms.cloud',
    fallbackApiKey: process.env.IRM_API_KEY || 'IRM-871EC742622E2080B346AF058223597EC935B6425359C986',
    syncIntervalSeconds: parseInt(process.env.IRM_SYNC_INTERVAL || '200', 10),
    sinceDaysLookback: 0, // Starts today T00:00:00Z like PHP date('Y-m-d') . 'T00:00:00Z'
    bookingBatchLimit: 50,
    inventoryBatchLimit: 20,
  },
};
