/**
 * MIRM Sync Unit - Types & Interfaces
 * Converted from MicroGenn PHP sync unit
 */

export interface MirmBookingPayload {
  id: number | string;
  booking_reference: string;
  room_type_id?: number;
  property_id?: number;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  status?: string;
  special_requests?: string;
  created_at?: string;
  updated_at?: string;
  payment_method?: string;
  payment_status?: string;
  stripe_session_id?: string;
  stripe_payment_id?: string;
  payment_gateway?: string;
  razorpay_order_id?: string;
  inventory_reduced?: boolean | string;
  adults?: number;
  children?: number;
  kids?: number;
  extra_beds?: number;
  pets?: number;
  room_rent?: number | string;
  extra_bed_total?: number | string;
  kids_total?: number | string;
  no_show?: boolean | string;
  no_show_charge?: number | string;
  walk_in?: boolean | string;
  web_checkin_completed?: boolean | string;
  tentative?: boolean | string;
  tentative_expires_at?: string;
  lead_time_days?: number;
  room_nos?: any[];
  check_in?: string;
  check_out?: string;
  num_rooms?: number;
  num_guests?: number;
}

export interface BookingSyncEntry {
  id: string | number;
  reference: string;
  status: 'inserted' | 'failed';
  message: string;
  guest_name?: string;
  amount?: number;
}

export interface BookingSyncResult {
  fetchError: string | null;
  totalFetched: number;
  inserted: number;
  failed: number;
  entries: BookingSyncEntry[];
  ack: {
    attempted: boolean;
    success: boolean;
    error: string | null;
    ids: (number | string)[];
  };
  durationMs?: number;
}

export interface InventorySyncEntry {
  avaidd: number | string;
  allotcode: string | number;
  status: 'updated' | 'failed';
  message: string;
  dateRange?: string;
  datesCount?: number;
}

export interface InventorySyncResult {
  processed: number;
  updated: number;
  failed: number;
  entries: InventorySyncEntry[];
  queryError: string | null;
  totalPending: number;
  durationMs?: number;
}

export interface FullSyncResult {
  id: string;
  timestamp: string;
  bookingSync: BookingSyncResult;
  inventorySync: InventorySyncResult;
  durationMs: number;
}

export interface RoomAvailabilityRow {
  avaidd: number;
  Roomtypeid: number;
  irmallotcode: string | null;
  fromdate: string;
  todate: string;
  Availablerooms: number;
  irmuploadflg: number;
  irmnotuploadflg: number;
  resolved_allotcode?: string;
}

export interface RoomTypeMaster {
  typeid: number;
  typename: string;
  irmroomtypeid: string;
  base_rate?: number;
}

export interface RoomMaster {
  roomid: number;
  roomno: string;
  typeid: number;
  inactive: number;
}

export interface SyncEngineStatus {
  isRunning: boolean;
  isSyncInProgress: boolean;
  lastRunAt: string | null;
  nextRunInSeconds: number;
  intervalSeconds: number;
  totalRuns: number;
  dbMode: 'mssql' | 'mock';
  dbConnected: boolean;
  dbError: string | null;
  resolvedApiKey: string;
  apiKeySource: 'database' | 'fallback' | 'environment';
  lastResult: FullSyncResult | null;
}
