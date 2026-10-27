/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Database,
  Server,
  Code2,
  FileText,
  Play,
  Pause,
  Copy,
  Check,
  Send,
  PlusCircle,
  RotateCcw,
  Sliders,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Layers,
  ChevronRight,
  Terminal,
  Download,
  Power,
  FolderOpen,
  Cpu,
  Package,
} from 'lucide-react';
import { FullSyncResult, SyncEngineStatus, MirmBookingPayload, RoomAvailabilityRow } from './server/types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'windows-service' | 'db' | 'webhook' | 'code' | 'logs'>('windows-service');
  const [status, setStatus] = useState<SyncEngineStatus | null>(null);
  const [lastResult, setLastResult] = useState<FullSyncResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [countdown, setCountdown] = useState<number>(200);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Database View states
  const [dbBookings, setDbBookings] = useState<any[]>([]);
  const [inventoryRows, setInventoryRows] = useState<RoomAvailabilityRow[]>([]);
  const [pendingInvCount, setPendingInvCount] = useState<number>(0);
  const [isLoadingDb, setIsLoadingDb] = useState<boolean>(false);

  // Webhook Simulator states
  const [webhookJson, setWebhookJson] = useState<string>(
    JSON.stringify(
      {
        id: 98510,
        booking_reference: 'MG-WEB-9921',
        room_type_id: 142,
        property_id: 1,
        guest_name: 'Priya Sundaram',
        guest_email: 'priya.sundaram@example.com',
        guest_phone: '+91 98412 87654',
        status: 'confirmed',
        special_requests: 'Ground floor room requested. Late check-in after 8 PM.',
        payment_method: 'card',
        payment_status: 'paid',
        payment_gateway: 'Razorpay',
        razorpay_order_id: 'order_Nx884129',
        adults: 2,
        children: 1,
        kids: 0,
        extra_beds: 1,
        room_rent: 4500.0,
        extra_bed_total: 800.0,
        check_in: new Date().toISOString().split('T')[0],
        check_out: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        num_rooms: 1,
        num_guests: 3,
        inventory_reduced: true,
      },
      null,
      2
    )
  );
  const [webhookResponse, setWebhookResponse] = useState<any>(null);
  const [isSubmittingWebhook, setIsSubmittingWebhook] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'booking' | 'inventory' | 'system'>('all');

  // Code Explorer state
  const [standaloneFiles, setStandaloneFiles] = useState<Record<string, string>>({});
  const [activeCodeFile, setActiveCodeFile] = useState<string>('install-service.bat');

  // Settings Modal
  const [showSettings, setShowSettings] = useState(false);
  const [configForm, setConfigForm] = useState<any>(null);

  // Fetch status and telemetry
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.success && data.status) {
        setStatus(data.status);
        if (data.status.lastResult) {
          setLastResult(data.status.lastResult);
        }
        if (data.status.nextRunInSeconds !== undefined) {
          setCountdown(data.status.nextRunInSeconds);
        }
      }
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  };

  // Fetch standalone code
  const fetchCode = async () => {
    try {
      const res = await fetch('/api/standalone/code');
      const data = await res.json();
      if (data.success && data.files) {
        setStandaloneFiles(data.files);
      }
    } catch (err) {
      console.error('Error fetching code:', err);
    }
  };

  // Fetch DB data
  const fetchDbData = async () => {
    setIsLoadingDb(true);
    try {
      const [bRes, iRes] = await Promise.all([fetch('/api/bookings'), fetch('/api/inventory')]);
      const bData = await bRes.json();
      const iData = await iRes.json();

      if (bData.success) setDbBookings(bData.bookings || []);
      if (iData.success) {
        setInventoryRows(iData.rows || []);
        setPendingInvCount(iData.pendingCount || 0);
      }
    } catch (err) {
      console.error('Error fetching DB data:', err);
    } finally {
      setIsLoadingDb(false);
    }
  };

  // Fetch logs
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/sync/logs');
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  // Fetch config for settings
  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.success && data.config) {
        setConfigForm(data.config);
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  };

  // Clock in IST (Asia/Kolkata) matching original PHP
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(
        d.toLocaleString('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll status & countdown every second
  useEffect(() => {
    fetchStatus();
    fetchCode();
    fetchConfig();

    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const refreshPoller = setInterval(() => {
      fetchStatus();
    }, 4000);

    return () => {
      clearInterval(interval);
      clearInterval(refreshPoller);
    };
  }, []);

  // Sync DB / Logs when switching tabs
  useEffect(() => {
    if (activeTab === 'db') fetchDbData();
    if (activeTab === 'logs') fetchLogs();
  }, [activeTab]);

  // Trigger manual sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/run', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.result) {
        setLastResult(data.result);
        fetchStatus();
        if (activeTab === 'db') fetchDbData();
        if (activeTab === 'logs') fetchLogs();
      }
    } catch (err) {
      console.error('Error triggering sync:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle scheduler
  const handleToggleScheduler = async () => {
    if (!status) return;
    const endpoint = status.isRunning ? '/api/sync/stop' : '/api/sync/start';
    try {
      await fetch(endpoint, { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error('Error toggling scheduler:', err);
    }
  };

  // Seed sample inventory row
  const handleSeedInventory = async () => {
    try {
      await fetch('/api/inventory/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Roomtypeid: Math.floor(Math.random() * 3) + 1,
          Availablerooms: Math.floor(Math.random() * 8) + 2,
        }),
      });
      fetchDbData();
      fetchStatus();
    } catch (err) {
      console.error('Error seeding inventory:', err);
    }
  };

  // Reset mock data
  const handleResetMock = async () => {
    try {
      await fetch('/api/mock/reset', { method: 'POST' });
      fetchDbData();
      fetchStatus();
    } catch (err) {
      console.error('Error resetting mock:', err);
    }
  };

  // Submit test webhook
  const handleSubmitWebhook = async () => {
    setIsSubmittingWebhook(true);
    try {
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(webhookJson);
      } catch (e: any) {
        setWebhookResponse({ success: false, error: 'Invalid JSON payload in editor: ' + e.message });
        setIsSubmittingWebhook(false);
        return;
      }

      const res = await fetch('/api/webhook/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedPayload),
      });
      const data = await res.json();
      setWebhookResponse(data);
      fetchDbData();
      fetchStatus();
    } catch (err: any) {
      setWebhookResponse({ success: false, error: err.message });
    } finally {
      setIsSubmittingWebhook(false);
    }
  };

  // Copy code helper
  const handleCopyCode = (filename: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 2500);
  };

  // Download Complete Windows Service Package as ZIP
  const handleDownloadZip = async () => {
    setIsDownloadingZip(true);
    try {
      // Create ZIP in-browser using JSZip to guarantee download works reliably in all iframe/browser environments
      const zip = new JSZip();

      // If standalone files are already loaded in state
      if (Object.keys(standaloneFiles).length > 0) {
        for (const [name, content] of Object.entries(standaloneFiles)) {
          zip.file(name, content);
        }
      } else {
        // Fallback fetch
        const res = await fetch('/api/standalone/code');
        const data = await res.json();
        if (data.success && data.files) {
          for (const [name, content] of Object.entries(data.files as Record<string, string>)) {
            zip.file(name, content);
          }
        }
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'microgenn-mirm-sync-windows-service.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP download error, trying direct link:', err);
      window.location.href = '/api/standalone/download-zip';
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Download Individual File
  const handleDownloadSingleFile = (filename: string) => {
    const content = standaloneFiles[filename];
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Save settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configForm) return;
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      });
      const data = await res.json();
      if (data.success) {
        setShowSettings(false);
        fetchStatus();
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  };

  const bookingSync = lastResult?.bookingSync;
  const inventorySync = lastResult?.inventorySync;
  const hasBookingError = bookingSync && bookingSync.fetchError !== null;
  const hasInvError = inventorySync && inventorySync.queryError !== null;

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#1f2430] flex flex-col font-sans">
      {/* TOP NAVIGATION / BRAND BAR */}
      <header className="bg-[#1a3a8f] text-white px-6 py-3.5 shadow-md flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 border-b border-[#2d4cb0]">
        <div className="flex items-center space-x-3">
          <div className="bg-[#e7a13a] text-[#1a3a8f] font-black text-sm px-2.5 py-1 rounded tracking-wide shadow-sm">
            MG
          </div>
          <div>
            <div className="font-bold text-base tracking-wide flex items-center space-x-2">
              <span>MICROGENN</span>
              <span className="text-[#e7a13a] font-normal">·</span>
              <span className="text-white/90 font-medium">MIRM Sync Services</span>
              <span className="bg-[#16a596] text-white text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ml-2">
                Windows Service
              </span>
            </div>
            <div className="text-xs text-white/70">Empowering Your Hotel's Digital Evolution</div>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Download Service ZIP Button in Header */}
          <button
            onClick={handleDownloadZip}
            disabled={isDownloadingZip}
            className="bg-[#e7a13a] hover:bg-[#d8932c] text-[#1a3a8f] font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-sm transition active:scale-95"
            title="Download Complete Windows Service (.ZIP)"
          >
            <Download className={`w-3.5 h-3.5 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
            <span>{isDownloadingZip ? 'Zipping...' : 'Download Service (.ZIP)'}</span>
          </button>

          <div className="hidden sm:flex items-center space-x-2 bg-[#132d73] px-3 py-1.5 rounded-lg border border-white/10">
            <Clock className="w-3.5 h-3.5 text-[#e7a13a]" />
            <span className="text-white/80">IST Time:</span>
            <span className="font-mono text-white font-medium">{currentTime || 'Loading...'}</span>
          </div>

          <div className="flex items-center space-x-2 bg-[#132d73] px-3 py-1.5 rounded-lg border border-white/10">
            <Server className="w-3.5 h-3.5 text-[#16a596]" />
            <span className="text-white/80">Service:</span>
            <span className="font-semibold text-emerald-300 uppercase">
              MicroGennMirmSync
            </span>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center space-x-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition"
            title="Configure Connection & Sync Engine"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* SUB-HEADER / TAB NAVIGATION */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('windows-service')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
              activeTab === 'windows-service'
                ? 'bg-[#1a3a8f] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-[#e7a13a]" />
            <span>Windows Service</span>
            <span className="bg-[#e7a13a] text-[#1a3a8f] text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              Download ZIP
            </span>
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
              activeTab === 'dashboard'
                ? 'bg-[#1a3a8f] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Sync Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('db')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
              activeTab === 'db'
                ? 'bg-[#1a3a8f] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>PMS Data Tables</span>
            {pendingInvCount > 0 && (
              <span className="bg-[#e7a13a] text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {pendingInvCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('webhook')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
              activeTab === 'webhook'
                ? 'bg-[#1a3a8f] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Webhook Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
              activeTab === 'code'
                ? 'bg-[#1a3a8f] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Service Scripts & Files</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
              activeTab === 'logs'
                ? 'bg-[#1a3a8f] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Activity Logs</span>
          </button>
        </nav>

        {/* Sync Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleToggleScheduler}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center space-x-1.5 transition border ${
              status?.isRunning
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            {status?.isRunning ? (
              <>
                <Pause className="w-3 h-3" />
                <span>Pause Auto-Sync</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                <span>Resume Auto-Sync</span>
              </>
            )}
          </button>

          <button
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className="bg-[#16a596] hover:bg-[#0f8c7f] disabled:opacity-50 text-white text-xs px-3.5 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>
      </div>

      {/* MAIN VIEW AREA */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* ============================================================ */}
        {/* TAB: WINDOWS SERVICE SETUP & DOWNLOAD HUB */}
        {/* ============================================================ */}
        {activeTab === 'windows-service' && (
          <div className="space-y-6">
            {/* BIG PROMINENT DOWNLOAD HUB CARD */}
            <div className="bg-gradient-to-r from-[#1a3a8f] to-[#132d73] rounded-xl text-white p-6 sm:p-8 shadow-lg border border-[#2d4cb0] relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center space-x-2 bg-white/10 px-3 py-1 rounded-full text-xs font-semibold text-emerald-300 border border-white/15 mb-3">
                    <Package className="w-3.5 h-3.5" />
                    <span>Official Windows Service Package · Ready for On-Premise</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    Download Windows Service (.ZIP)
                  </h2>
                  <p className="text-xs text-white/80 max-w-xl mt-1.5 leading-relaxed">
                    Includes all 1-click installer batch files (<strong>install-service.bat</strong>,{' '}
                    <strong>service-control.bat</strong>), Node.js service daemon (<strong>mirm-sync.js</strong>),{' '}
                    environment template, and automatic recovery handlers.
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-white/70 mt-3 font-mono">
                    <span className="bg-black/20 px-2 py-0.5 rounded">📦 10 Files</span>
                    <span className="bg-black/20 px-2 py-0.5 rounded">⚙️ Auto-registers in services.msc</span>
                    <span className="bg-black/20 px-2 py-0.5 rounded">🔄 Starts on Windows Boot</span>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleDownloadZip}
                    disabled={isDownloadingZip}
                    className="bg-[#e7a13a] hover:bg-[#d8932c] text-[#1a3a8f] font-extrabold text-sm px-6 py-3.5 rounded-xl flex items-center justify-center space-x-2.5 shadow-md transition transform active:scale-95"
                  >
                    <Download className={`w-5 h-5 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
                    <span>{isDownloadingZip ? 'Preparing ZIP...' : 'Download Full Package (.ZIP)'}</span>
                  </button>
                </div>
              </div>

              {/* Background accent decorations */}
              <div className="absolute right-0 top-0 bottom-0 w-80 bg-radial from-white/10 to-transparent pointer-events-none opacity-40" />
            </div>

            {/* INDIVIDUAL FILE DOWNLOAD CARDS */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-sm text-gray-900 flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-[#1a3a8f]" />
                    <span>Included Service Files & Single-File Downloads</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Download individual scripts or copy their source code directly.
                  </p>
                </div>

                <button
                  onClick={handleDownloadZip}
                  className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download All as ZIP</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  {
                    name: 'install-service.bat',
                    desc: '1-Click Administrator auto-installer (Right click -> Run as Admin)',
                    tag: 'Installer',
                    tagColor: 'bg-emerald-100 text-emerald-800',
                  },
                  {
                    name: 'service-control.bat',
                    desc: 'Interactive IT manager menu (Start, Stop, Restart, Status, services.msc)',
                    tag: 'Control Panel',
                    tagColor: 'bg-blue-100 text-blue-800',
                  },
                  {
                    name: 'mirm-sync.js',
                    desc: 'Core Node.js synchronization daemon and MSSQL connection pool',
                    tag: 'Core Daemon',
                    tagColor: 'bg-purple-100 text-purple-800',
                  },
                  {
                    name: 'install-service.js',
                    desc: 'Native node-windows registration script with auto-restart policies',
                    tag: 'Script',
                    tagColor: 'bg-gray-100 text-gray-800',
                  },
                  {
                    name: 'uninstall-service.bat',
                    desc: 'Cleanly stops and deletes MicroGennMirmSync from services.msc',
                    tag: 'Uninstaller',
                    tagColor: 'bg-red-100 text-red-800',
                  },
                  {
                    name: '.env.example',
                    desc: 'Database and API credential configuration template',
                    tag: 'Config',
                    tagColor: 'bg-amber-100 text-amber-800',
                  },
                  {
                    name: 'package.json',
                    desc: 'Standalone project dependencies (mssql, dotenv, node-windows)',
                    tag: 'NPM Spec',
                    tagColor: 'bg-gray-100 text-gray-800',
                  },
                  {
                    name: 'winsw-config.xml',
                    desc: 'Optional WinSW XML wrapper specification for enterprise setups',
                    tag: 'WinSW',
                    tagColor: 'bg-gray-100 text-gray-800',
                  },
                  {
                    name: 'README.md',
                    desc: 'Complete deployment guide and SQL Server Express troubleshooting',
                    tag: 'Docs',
                    tagColor: 'bg-emerald-100 text-emerald-800',
                  },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="border border-gray-200 rounded-lg p-3.5 hover:border-blue-300 hover:shadow-xs transition bg-gray-50/50 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-xs font-bold text-gray-900 truncate">
                          {item.name}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.tagColor}`}>
                          {item.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-snug mb-3">
                        {item.desc}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 pt-2 border-t border-gray-200/60">
                      <button
                        onClick={() => handleDownloadSingleFile(item.name)}
                        className="flex-1 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 text-[11px] font-semibold py-1 px-2.5 rounded flex items-center justify-center space-x-1 transition shadow-2xs"
                      >
                        <Download className="w-3 h-3 text-[#1a3a8f]" />
                        <span>Download</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab('code');
                          setActiveCodeFile(item.name);
                        }}
                        className="bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-[11px] font-medium py-1 px-2 rounded flex items-center justify-center space-x-1 transition shadow-2xs"
                        title="View & Copy Code"
                      >
                        <Code2 className="w-3 h-3 text-gray-500" />
                        <span>View</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3-STEP INSTALLATION GUIDE CARD */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 shadow-xs">
              <h3 className="font-bold text-sm text-gray-900 mb-4 flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-[#16a596]" />
                <span>3-Step Installation on Windows Server</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Step 1 */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-6 h-6 rounded-full bg-[#1a3a8f] text-white text-xs font-bold flex items-center justify-center">
                        1
                      </span>
                      <span className="text-[11px] font-mono text-gray-500">Prerequisites</span>
                    </div>
                    <h4 className="font-bold text-xs text-gray-900 mb-1">Extract ZIP to Folder</h4>
                    <p className="text-xs text-gray-600 leading-relaxed mb-3">
                      Download the ZIP and extract it on your Windows server (e.g., to <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800 font-mono text-[11px]">C:\MicroGenn\mirm-sync\</code>).
                    </p>
                    <div className="bg-gray-900 text-emerald-400 font-mono text-[11px] p-2 rounded">
                      C:\MicroGenn\mirm-sync\
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-gray-500">
                    Ensure Node.js 18+ is installed on the server.
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-6 h-6 rounded-full bg-[#16a596] text-white text-xs font-bold flex items-center justify-center">
                        2
                      </span>
                      <span className="text-[11px] font-mono text-gray-500">Configuration</span>
                    </div>
                    <h4 className="font-bold text-xs text-gray-900 mb-1">Configure Database (.env)</h4>
                    <p className="text-xs text-gray-600 leading-relaxed mb-3">
                      Copy <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800">.env.example</code> to <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800">.env</code> and verify your SQL Server credentials:
                    </p>
                    <div className="bg-gray-900 text-gray-200 font-mono text-[11px] p-2 rounded leading-tight">
                      IRM_DB_SERVER=admin-pc\sqlexpress<br />
                      IRM_DB_NAME=vpi3108<br />
                      IRM_DB_USER=sa
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-gray-500">
                    Ensure TCP/IP Port 1433 is enabled in SQL Configuration Manager.
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-6 h-6 rounded-full bg-[#e7a13a] text-white text-xs font-bold flex items-center justify-center">
                        3
                      </span>
                      <span className="text-[11px] font-mono text-gray-500">1-Click Install</span>
                    </div>
                    <h4 className="font-bold text-xs text-gray-900 mb-1">Run install-service.bat</h4>
                    <p className="text-xs text-gray-600 leading-relaxed mb-3">
                      Right-click <strong className="text-blue-700">install-service.bat</strong> and select <strong>"Run as Administrator"</strong>:
                    </p>
                    <div className="bg-gray-900 text-yellow-300 font-mono text-[11px] p-2 rounded">
                      &gt; install-service.bat
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-emerald-600 font-medium flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Registers & starts Windows Service automatically!</span>
                  </div>
                </div>
              </div>

              {/* Windows Service Control Commands */}
              <div className="mt-8 border-t border-gray-100 pt-6">
                <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-[#1a3a8f]" />
                  <span>Windows Service Command Reference (PowerShell / Command Prompt as Admin)</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="bg-gray-900 text-white rounded-lg p-3 font-mono">
                    <div className="text-gray-400 text-[10px] mb-1 uppercase font-semibold">Start Service</div>
                    <div className="text-emerald-400">net start MicroGennMirmSync</div>
                  </div>
                  <div className="bg-gray-900 text-white rounded-lg p-3 font-mono">
                    <div className="text-gray-400 text-[10px] mb-1 uppercase font-semibold">Stop Service</div>
                    <div className="text-red-400">net stop MicroGennMirmSync</div>
                  </div>
                  <div className="bg-gray-900 text-white rounded-lg p-3 font-mono">
                    <div className="text-gray-400 text-[10px] mb-1 uppercase font-semibold">Query Status</div>
                    <div className="text-blue-300">sc query MicroGennMirmSync</div>
                  </div>
                  <div className="bg-gray-900 text-white rounded-lg p-3 font-mono">
                    <div className="text-gray-400 text-[10px] mb-1 uppercase font-semibold">Open GUI Services</div>
                    <div className="text-yellow-300">services.msc</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 1: SYNC DASHBOARD */}
        {/* ============================================================ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* TOP SYNC STATUS HERO CARD */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 shadow-xs text-center relative overflow-hidden">
              <div className="max-w-xl mx-auto">
                <div className="text-2xl font-extrabold tracking-tight">
                  <span className="text-[#1a3a8f]">MG </span>
                  <span className="text-[#1a3a8f]">MICRO</span>
                  <span className="text-[#e7a13a]">GENN</span>
                </div>
                <div className="text-xs text-gray-500 tracking-wider uppercase mt-0.5 mb-6">
                  Empowering Your Hotel's Digital Evolution
                </div>

                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">
                  MIRM Syncing Services
                </h1>

                {/* ANIMATED SPINNER CIRCLE */}
                <div className="relative mx-auto mb-5 w-24 h-24 flex items-center justify-center">
                  <div
                    className={`w-24 h-24 rounded-full flex items-center justify-center shadow-md transition-colors ${
                      hasBookingError || hasInvError
                        ? 'bg-[#c0392b]'
                        : isSyncing
                        ? 'bg-[#1a3a8f]'
                        : 'bg-[#16a596]'
                    }`}
                  >
                    {hasBookingError || hasInvError ? (
                      <AlertCircle className="w-10 h-10 text-white" />
                    ) : isSyncing ? (
                      <RefreshCw className="w-10 h-10 text-white animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-10 h-10 text-white" />
                    )}
                  </div>
                </div>

                <h2 className="text-lg font-semibold text-gray-800">
                  {hasBookingError
                    ? 'Booking sync reported an issue'
                    : isSyncing
                    ? 'Syncing is currently in progress...'
                    : 'Syncing engine is active & healthy'}
                </h2>

                <p className="text-xs text-gray-500 mt-1 mb-6">
                  {status?.isRunning ? (
                    <>
                      Next auto-pass in ~<span className="font-bold text-gray-700">{countdown}s</span> · Interval:{' '}
                      {status.intervalSeconds}s · Last run:{' '}
                      {status.lastRunAt ? new Date(status.lastRunAt).toLocaleTimeString() : 'Pending'}
                    </>
                  ) : (
                    <span className="text-amber-600 font-medium">
                      Background auto-sync is currently paused · Click "Resume Auto-Sync" or "Sync Now"
                    </span>
                  )}
                </p>

                {/* Progress bar countdown */}
                {status?.isRunning && (
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mb-6 overflow-hidden">
                    <div
                      className="bg-[#16a596] h-1.5 rounded-full transition-all duration-1000 ease-linear"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, ((status.intervalSeconds - countdown) / status.intervalSeconds) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* BOOKINGS SYNC CARD SECTION */}
              <div className="border-t border-gray-100 pt-6 text-left">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
                      <span>MIRM Bookings Fetch & Store</span>
                      <span className="text-xs font-normal text-gray-500">
                        (Offline Bookings API → Mirm_bookings)
                      </span>
                    </h3>
                  </div>
                  {bookingSync?.durationMs && (
                    <span className="text-xs text-gray-400 font-mono">
                      {bookingSync.durationMs}ms
                    </span>
                  )}
                </div>

                {hasBookingError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3.5 text-xs mb-4 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <strong>Fetch error:</strong> {bookingSync?.fetchError}
                    </div>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="border border-gray-200 rounded-lg p-3 text-center bg-gray-50/50">
                    <div className="text-xl font-bold text-[#1a3a8f]">
                      {bookingSync ? bookingSync.totalFetched : 0}
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mt-0.5">
                      Fetched
                    </div>
                  </div>

                  <div className="border border-[#cdeee0] rounded-lg p-3 text-center bg-[#e8f7f0]">
                    <div className="text-xl font-bold text-[#1a9b6c]">
                      {bookingSync ? bookingSync.inserted : 0}
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold mt-0.5">
                      Inserted
                    </div>
                  </div>

                  <div
                    className={`border rounded-lg p-3 text-center ${
                      bookingSync && bookingSync.failed > 0
                        ? 'bg-[#fbeaea] border-[#f3d3ce]'
                        : 'bg-gray-50/50 border-gray-200'
                    }`}
                  >
                    <div
                      className={`text-xl font-bold ${
                        bookingSync && bookingSync.failed > 0 ? 'text-[#c0392b]' : 'text-gray-400'
                      }`}
                    >
                      {bookingSync ? bookingSync.failed : 0}
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mt-0.5">
                      Failed
                    </div>
                  </div>
                </div>

                {/* Booking Entries Table */}
                {bookingSync && bookingSync.entries.length > 0 ? (
                  <div className="border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 uppercase text-[11px] border-b border-gray-200">
                          <th className="py-2.5 px-3 font-semibold">Booking ID</th>
                          <th className="py-2.5 px-3 font-semibold">Reference</th>
                          <th className="py-2.5 px-3 font-semibold">Guest</th>
                          <th className="py-2.5 px-3 font-semibold">Status</th>
                          <th className="py-2.5 px-3 font-semibold">Detail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bookingSync.entries.map((entry, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/70">
                            <td className="py-2.5 px-3 font-mono font-medium">{String(entry.id)}</td>
                            <td className="py-2.5 px-3 font-mono text-gray-700">{entry.reference}</td>
                            <td className="py-2.5 px-3 font-medium text-gray-900">
                              {entry.guest_name || '—'}
                            </td>
                            <td className="py-2.5 px-3">
                              {entry.status === 'inserted' ? (
                                <span className="bg-[#e8f7f0] text-[#1a9b6c] text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block">
                                  Inserted
                                </span>
                              ) : (
                                <span className="bg-[#fbeaea] text-[#c0392b] text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block">
                                  Failed
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-gray-600">{entry.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 py-3 text-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    No new bookings returned on this pass.
                  </p>
                )}

                {/* Acknowledgement Note */}
                {bookingSync?.ack.attempted && (
                  <div
                    className={`mt-3 text-xs p-2.5 rounded-md flex items-center space-x-2 ${
                      bookingSync.ack.success
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {bookingSync.ack.success
                        ? `Acknowledged ${bookingSync.ack.ids.length} booking(s) with IRM: [${bookingSync.ack.ids.join(
                            ', '
                          )}]`
                        : `Acknowledgement failed: ${bookingSync.ack.error}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ROOM INVENTORY SYNC CARD SECTION */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
                    <span>Room Inventory Sync</span>
                    <span className="bg-blue-50 text-[#1a3a8f] text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-100">
                      trans_roomavailability_chart_datewise → IRM
                    </span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    {inventorySync ? (
                      <>
                        <span className="font-semibold text-gray-700">
                          {inventorySync.totalPending} row(s)
                        </span>{' '}
                        currently pending in total
                        {inventorySync.totalPending > inventorySync.processed && (
                          <span className="text-amber-700">
                            {' '}
                            — {inventorySync.processed} processed this pass; backlog will clear over
                            upcoming passes.
                          </span>
                        )}
                      </>
                    ) : (
                      'Pushes date-range availability expanded daily into IRM API'
                    )}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleSeedInventory}
                    className="text-xs text-[#1a3a8f] hover:text-[#132d73] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-medium transition"
                    title="Seed a sample pending row to test inventory sync"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Seed Test Pending Row</span>
                  </button>
                </div>
              </div>

              {hasInvError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3.5 text-xs mb-4">
                  <strong>Query error:</strong> {inventorySync?.queryError}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="border border-gray-200 rounded-lg p-3 text-center bg-gray-50/50">
                  <div className="text-xl font-bold text-[#1a3a8f]">
                    {inventorySync ? inventorySync.processed : 0}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mt-0.5">
                    Processed
                  </div>
                </div>

                <div className="border border-[#cdeee0] rounded-lg p-3 text-center bg-[#e8f7f0]">
                  <div className="text-xl font-bold text-[#1a9b6c]">
                    {inventorySync ? inventorySync.updated : 0}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold mt-0.5">
                    Updated
                  </div>
                </div>

                <div
                  className={`border rounded-lg p-3 text-center ${
                    inventorySync && inventorySync.failed > 0
                      ? 'bg-[#fbeaea] border-[#f3d3ce]'
                      : 'bg-gray-50/50 border-gray-200'
                  }`}
                >
                  <div
                    className={`text-xl font-bold ${
                      inventorySync && inventorySync.failed > 0 ? 'text-[#c0392b]' : 'text-gray-400'
                    }`}
                  >
                    {inventorySync ? inventorySync.failed : 0}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mt-0.5">
                    Failed
                  </div>
                </div>
              </div>

              {/* Inventory Table */}
              {inventorySync && inventorySync.entries.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 uppercase text-[11px] border-b border-gray-200">
                        <th className="py-2.5 px-3 font-semibold">Avaidd</th>
                        <th className="py-2.5 px-3 font-semibold">Room Type / Allot Code</th>
                        <th className="py-2.5 px-3 font-semibold">Date Range</th>
                        <th className="py-2.5 px-3 font-semibold">Status</th>
                        <th className="py-2.5 px-3 font-semibold">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {inventorySync.entries.map((entry, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/70">
                          <td className="py-2.5 px-3 font-mono font-medium">{String(entry.avaidd)}</td>
                          <td className="py-2.5 px-3 font-mono text-gray-700">
                            {entry.allotcode || 'None'}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 font-mono text-[11px]">
                            {entry.dateRange || '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            {entry.status === 'updated' ? (
                              <span className="bg-[#e8f7f0] text-[#1a9b6c] text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block">
                                Updated
                              </span>
                            ) : (
                              <span className="bg-[#fbeaea] text-[#c0392b] text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block">
                                Failed
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600">{entry.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-500 py-3 text-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  No pending inventory rows processed on this pass.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: PMS DATABASE TABLES EXPLORER */}
        {/* ============================================================ */}
        {activeTab === 'db' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                    <Database className="w-5 h-5 text-[#1a3a8f]" />
                    <span>PMS Database Explorer</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Live inspection of records in <code className="text-blue-600">Mirm_bookings</code> and{' '}
                    <code className="text-blue-600">trans_roomavailability_chart_datewise</code>.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleResetMock}
                    className="text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Sample Data</span>
                  </button>

                  <button
                    onClick={handleSeedInventory}
                    className="text-xs text-white bg-[#1a3a8f] hover:bg-[#132d73] px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition font-semibold"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Add Pending Availability</span>
                  </button>

                  <button
                    onClick={fetchDbData}
                    disabled={isLoadingDb}
                    className="text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDb ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Table 1: Mirm_bookings */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm text-gray-800 flex items-center space-x-2">
                    <span>Table: Mirm_bookings</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                      {dbBookings.length} row(s)
                    </span>
                  </h3>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-gray-50 text-gray-500 uppercase text-[11px] border-b border-gray-200">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">BMID</th>
                        <th className="py-2.5 px-3 font-semibold">Reference</th>
                        <th className="py-2.5 px-3 font-semibold">Guest</th>
                        <th className="py-2.5 px-3 font-semibold">Contact</th>
                        <th className="py-2.5 px-3 font-semibold">Check-In / Out</th>
                        <th className="py-2.5 px-3 font-semibold">Rent (₹)</th>
                        <th className="py-2.5 px-3 font-semibold">Payment</th>
                        <th className="py-2.5 px-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dbBookings.length > 0 ? (
                        dbBookings.map((b, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="py-2.5 px-3 font-mono font-medium text-gray-500">{b.bmid}</td>
                            <td className="py-2.5 px-3 font-mono font-medium text-[#1a3a8f]">
                              {b.booking_reference}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-gray-900">{b.guest_name}</td>
                            <td className="py-2.5 px-3 text-gray-600">
                              <div>{b.guest_email}</div>
                              <div className="text-[11px] text-gray-400">{b.guest_phone}</div>
                            </td>
                            <td className="py-2.5 px-3 text-gray-600 font-mono text-[11px]">
                              {b.check_in} → {b.check_out}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-gray-900">
                              ₹{Number(b.room_rent || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 rounded uppercase font-medium">
                                {b.payment_gateway || b.payment_method || 'Direct'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-4 text-center text-gray-400">
                            No bookings currently recorded in Mirm_bookings table.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: trans_roomavailability_chart_datewise */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm text-gray-800 flex items-center space-x-2">
                    <span>Table: trans_roomavailability_chart_datewise</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                      {inventoryRows.length} row(s)
                    </span>
                  </h3>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-gray-50 text-gray-500 uppercase text-[11px] border-b border-gray-200">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Avaidd</th>
                        <th className="py-2.5 px-3 font-semibold">Local RoomTypeId</th>
                        <th className="py-2.5 px-3 font-semibold">irmallotcode</th>
                        <th className="py-2.5 px-3 font-semibold">Dates (From → To)</th>
                        <th className="py-2.5 px-3 font-semibold">Available</th>
                        <th className="py-2.5 px-3 font-semibold">irmuploadflg</th>
                        <th className="py-2.5 px-3 font-semibold">irmnotuploadflg</th>
                        <th className="py-2.5 px-3 font-semibold">Sync Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {inventoryRows.length > 0 ? (
                        inventoryRows.map((r, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="py-2.5 px-3 font-mono font-medium">{r.avaidd}</td>
                            <td className="py-2.5 px-3 font-medium text-gray-700">Type #{r.Roomtypeid}</td>
                            <td className="py-2.5 px-3 font-mono text-gray-600">
                              {r.irmallotcode ? (
                                r.irmallotcode
                              ) : (
                                <span className="text-amber-600 italic">Fallback (roomtype master)</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-gray-600">
                              {r.fromdate} → {r.todate}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-gray-900">{r.Availablerooms}</td>
                            <td className="py-2.5 px-3 font-mono">{r.irmuploadflg}</td>
                            <td className="py-2.5 px-3 font-mono">{r.irmnotuploadflg}</td>
                            <td className="py-2.5 px-3">
                              {!r.irmuploadflg || r.irmuploadflg === 0 ? (
                                <span className="bg-amber-100 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                                  Pending Sync
                                </span>
                              ) : r.irmnotuploadflg === 0 ? (
                                <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                                  Pushed OK
                                </span>
                              ) : (
                                <span className="bg-red-100 text-red-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                                  Failed / Flagged
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-4 text-center text-gray-400">
                            No availability rows found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: WEBHOOK SIMULATOR */}
        {/* ============================================================ */}
        {activeTab === 'webhook' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                    <Send className="w-5 h-5 text-[#16a596]" />
                    <span>MIRM Booking Webhook Simulator</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Emulates the direct HTTP POST endpoint converted from{' '}
                    <code className="text-blue-600">insert_mirm_booking.php</code>.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2.5 py-1 rounded border border-gray-200">
                    POST /api/webhook/booking
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-700">Payload JSON:</label>
                    <button
                      onClick={() => {
                        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
                        const sample = {
                          id: 100000 + randomSuffix,
                          booking_reference: `IRM-MG-${randomSuffix}`,
                          room_type_id: 142,
                          property_id: 1,
                          guest_name: 'Vikramaditya Roy',
                          guest_email: 'vikram.roy@example.com',
                          guest_phone: '+91 97112 34991',
                          status: 'confirmed',
                          special_requests: 'Sea-facing corner suite, anniversary celebration.',
                          payment_method: 'card',
                          payment_status: 'paid',
                          payment_gateway: 'Razorpay',
                          razorpay_order_id: `pay_ord_${randomSuffix}`,
                          adults: 2,
                          children: 0,
                          room_rent: 8500,
                          check_in: new Date().toISOString().split('T')[0],
                          check_out: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
                          num_rooms: 1,
                          num_guests: 2,
                          inventory_reduced: true,
                        };
                        setWebhookJson(JSON.stringify(sample, null, 2));
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Regenerate Random Booking
                    </button>
                  </div>

                  <textarea
                    value={webhookJson}
                    onChange={(e) => setWebhookJson(e.target.value)}
                    rows={16}
                    className="w-full font-mono text-xs p-3.5 bg-gray-900 text-emerald-400 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-[#16a596]"
                  />

                  <button
                    onClick={handleSubmitWebhook}
                    disabled={isSubmittingWebhook}
                    className="mt-3 w-full bg-[#16a596] hover:bg-[#0f8c7f] disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-lg flex items-center justify-center space-x-2 transition shadow-sm"
                  >
                    <Send className={`w-3.5 h-3.5 ${isSubmittingWebhook ? 'animate-spin' : ''}`} />
                    <span>{isSubmittingWebhook ? 'Executing Webhook...' : 'Send Webhook Request'}</span>
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-2">
                    Execution Response:
                  </label>
                  <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-gray-200 border border-gray-800 min-h-[360px] overflow-auto">
                    {webhookResponse ? (
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(webhookResponse, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-gray-500 italic flex flex-col items-center justify-center h-80">
                        <Send className="w-8 h-8 text-gray-600 mb-2 opacity-50" />
                        Click "Send Webhook Request" to test inserting a booking into Mirm_bookings
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: SERVICE SCRIPTS & FILES */}
        {/* ============================================================ */}
        {activeTab === 'code' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                    <Code2 className="w-5 h-5 text-[#1a3a8f]" />
                    <span>Windows Service Scripts & Deployment Package</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Ready-to-deploy files for registering and running the MIRM Sync service on Windows.
                  </p>
                </div>

                {/* Direct Download ZIP button */}
                <button
                  onClick={handleDownloadZip}
                  disabled={isDownloadingZip}
                  className="bg-[#e7a13a] hover:bg-[#d8932c] text-[#1a3a8f] font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-2 transition shadow-xs"
                >
                  <Download className={`w-3.5 h-3.5 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
                  <span>Download Complete Package (.ZIP)</span>
                </button>
              </div>

              {/* Code Viewer tabs */}
              <div className="flex items-center space-x-2 border-b border-gray-200 pb-2 mb-4 overflow-x-auto">
                {Object.keys(standaloneFiles).map((filename) => (
                  <button
                    key={filename}
                    onClick={() => setActiveCodeFile(filename)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition flex items-center space-x-1.5 shrink-0 ${
                      activeCodeFile === filename
                        ? 'bg-[#1a3a8f] text-white shadow-xs'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{filename}</span>
                  </button>
                ))}

                <div className="flex-1" />

                {activeCodeFile && (
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => handleDownloadSingleFile(activeCodeFile)}
                      className="text-xs bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition font-medium"
                    >
                      <Download className="w-3.5 h-3.5 text-[#1a3a8f]" />
                      <span>Download File</span>
                    </button>

                    <button
                      onClick={() => handleCopyCode(activeCodeFile, standaloneFiles[activeCodeFile] || '')}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition font-medium"
                    >
                      {copiedFile === activeCodeFile ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Content</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* File content display */}
              <div className="relative">
                <pre className="bg-gray-900 text-gray-200 text-xs font-mono p-4 rounded-lg overflow-x-auto max-h-[500px] border border-gray-800">
                  <code>{standaloneFiles[activeCodeFile] || '// Loading file content...'}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: ACTIVITY LOGS */}
        {/* ============================================================ */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                    <Terminal className="w-5 h-5 text-[#1a3a8f]" />
                    <span>Live Sync Engine Activity Stream</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Real-time operational events, queries, API roundtrips, and acknowledgements.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  {(['all', 'booking', 'inventory', 'system'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setLogFilter(filter)}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium capitalize transition ${
                        logFilter === filter
                          ? 'bg-[#1a3a8f] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                  <button
                    onClick={fetchLogs}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1 rounded-md"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-[460px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-50 text-gray-500 uppercase text-[11px] border-b border-gray-200">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Timestamp</th>
                      <th className="py-2 px-3 font-semibold">Level</th>
                      <th className="py-2 px-3 font-semibold">Category</th>
                      <th className="py-2 px-3 font-semibold">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
                    {logs
                      .filter((l) => logFilter === 'all' || l.category === logFilter)
                      .map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-400 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            {log.level === 'success' && (
                              <span className="text-emerald-600 font-bold">SUCCESS</span>
                            )}
                            {log.level === 'info' && (
                              <span className="text-blue-600 font-bold">INFO</span>
                            )}
                            {log.level === 'warn' && (
                              <span className="text-amber-600 font-bold">WARN</span>
                            )}
                            {log.level === 'error' && (
                              <span className="text-red-600 font-bold">ERROR</span>
                            )}
                          </td>
                          <td className="py-2 px-3 uppercase text-gray-500 font-semibold">
                            {log.category}
                          </td>
                          <td className="py-2 px-3 text-gray-800">{log.message}</td>
                        </tr>
                      ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-gray-400 font-sans">
                          No logs recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-200 py-4 px-6 text-xs text-gray-500 flex flex-wrap items-center justify-between gap-2 mt-auto">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-gray-700">MICROGENN Systems</span>
          <span>·</span>
          <span>MIRM PMS Sync Suite</span>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleDownloadZip}
            className="text-[#1a3a8f] font-bold hover:underline flex items-center space-x-1"
          >
            <Download className="w-3 h-3" />
            <span>Download Service ZIP</span>
          </button>
          <span>·</span>
          <span>Service: MicroGennMirmSync</span>
          <span className="text-emerald-600 font-medium">● Daemon Active</span>
        </div>
      </footer>

      {/* CONFIGURATION & SETTINGS MODAL */}
      {showSettings && configForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-[#1a3a8f]" />
                <span>MIRM Engine Configuration</span>
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              {/* Database Mode Switch */}
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <label className="font-semibold text-gray-800 block mb-1">Database Mode:</label>
                <div className="flex items-center space-x-4 mt-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="useMock"
                      checked={configForm.db.useMock === true}
                      onChange={() =>
                        setConfigForm({
                          ...configForm,
                          db: { ...configForm.db, useMock: true },
                        })
                      }
                      className="text-[#1a3a8f]"
                    />
                    <span className="font-medium text-gray-700">
                      In-Memory Simulation (Cloud Demo)
                    </span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="useMock"
                      checked={configForm.db.useMock === false}
                      onChange={() =>
                        setConfigForm({
                          ...configForm,
                          db: { ...configForm.db, useMock: false },
                        })
                      }
                      className="text-[#1a3a8f]"
                    />
                    <span className="font-medium text-gray-700">
                      Real MSSQL Server
                    </span>
                  </label>
                </div>
              </div>

              {/* MSSQL Connection Params */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">SQL Server Host:</label>
                  <input
                    type="text"
                    value={configForm.db.server}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        db: { ...configForm.db, server: e.target.value },
                      })
                    }
                    className="w-full border border-gray-300 rounded p-2 font-mono text-xs"
                    placeholder="admin-pc\sqlexpress"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Database Name:</label>
                  <input
                    type="text"
                    value={configForm.db.database}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        db: { ...configForm.db, database: e.target.value },
                      })
                    }
                    className="w-full border border-gray-300 rounded p-2 font-mono text-xs"
                    placeholder="vpi3108"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">DB User:</label>
                  <input
                    type="text"
                    value={configForm.db.user}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        db: { ...configForm.db, user: e.target.value },
                      })
                    }
                    className="w-full border border-gray-300 rounded p-2 font-mono text-xs"
                    placeholder="sa"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">DB Password:</label>
                  <input
                    type="password"
                    value={configForm.db.password}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        db: { ...configForm.db, password: e.target.value },
                      })
                    }
                    className="w-full border border-gray-300 rounded p-2 font-mono text-xs"
                    placeholder="••••••"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Port:</label>
                  <input
                    type="number"
                    value={configForm.db.port}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        db: { ...configForm.db, port: parseInt(e.target.value, 10) || 1433 },
                      })
                    }
                    className="w-full border border-gray-300 rounded p-2 font-mono text-xs"
                    placeholder="1433"
                  />
                </div>
              </div>

              {/* IRM API Config */}
              <div>
                <label className="font-semibold text-gray-700 block mb-1">IRM Base URL:</label>
                <input
                  type="text"
                  value={configForm.irm.baseUrl}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      irm: { ...configForm.irm, baseUrl: e.target.value },
                    })
                  }
                  className="w-full border border-gray-300 rounded p-2 font-mono text-xs"
                  placeholder="https://irm.mhms.cloud"
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  IRM API Key (Fallback):
                </label>
                <input
                  type="text"
                  value={configForm.irm.fallbackApiKey}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      irm: { ...configForm.irm, fallbackApiKey: e.target.value },
                    })
                  }
                  className="w-full border border-gray-300 rounded p-2 font-mono text-xs"
                  placeholder="IRM-XXXX..."
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Sync Interval (Seconds):
                </label>
                <select
                  value={configForm.irm.syncIntervalSeconds}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      irm: {
                        ...configForm.irm,
                        syncIntervalSeconds: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full border border-gray-300 rounded p-2 text-xs"
                >
                  <option value={30}>30 seconds (Aggressive)</option>
                  <option value={60}>60 seconds (1 minute)</option>
                  <option value={120}>120 seconds (2 minutes)</option>
                  <option value={200}>200 seconds (Default - matching PHP)</option>
                  <option value={300}>300 seconds (5 minutes)</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1.5 rounded text-gray-600 hover:bg-gray-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1a3a8f] hover:bg-[#132d73] text-white font-semibold shadow-xs"
                >
                  Save & Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
