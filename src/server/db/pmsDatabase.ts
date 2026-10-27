/**
 * MIRM Sync Unit - Database Access Layer
 * Supports both direct MSSQL connections (via mssql driver)
 * and an accurate In-Memory PMS Engine for testing, demo, and standalone deployment.
 */

import sql from 'mssql';
import { AppConfig } from '../config.js';
import { MirmBookingPayload, RoomAvailabilityRow, RoomTypeMaster, RoomMaster } from '../types.js';

export interface DatabaseAdapter {
  isMock: boolean;
  isConnected: boolean;
  error: string | null;
  connect(): Promise<boolean>;
  getApiKey(): Promise<{ apiKey: string; source: 'database' | 'fallback' }>;
  insertBooking(data: MirmBookingPayload): Promise<{ success: boolean; error: string | null; id?: number }>;
  getPendingInventory(limit: number): Promise<{ rows: RoomAvailabilityRow[]; queryError: string | null }>;
  getPendingInventoryCount(): Promise<number>;
  getRoomTypeTotal(roomTypeId: number, cache: Map<number, number | null>): Promise<number | null>;
  updateInventoryFlags(avaidd: number, uploadFlg: number, notUploadFlg: number): Promise<{ success: boolean; rowsAffected: number }>;
  getBookings(limit?: number): Promise<any[]>;
  getAllInventoryRows(): Promise<RoomAvailabilityRow[]>;
  resetMockData(): void;
  seedMockInventoryRow(row: Partial<RoomAvailabilityRow>): void;
}

// In-Memory PMS Database Implementation
class MockPmsDatabase implements DatabaseAdapter {
  isMock = true;
  isConnected = true;
  error = null;

  private extraoption = {
    Enablembookingengineintergration: 1,
    Mbookingengineapikey: 'IRM-871EC742622E2080B346AF058223597EC935B6425359C986',
  };

  private roomtypes: RoomTypeMaster[] = [
    { typeid: 1, typename: 'Deluxe Room', irmroomtypeid: '142', base_rate: 3500 },
    { typeid: 2, typename: 'Executive Suite', irmroomtypeid: '143', base_rate: 5500 },
    { typeid: 3, typename: 'Standard Double', irmroomtypeid: '144', base_rate: 2800 },
    { typeid: 4, typename: 'Family Villa', irmroomtypeid: '145', base_rate: 7200 },
  ];

  private roommas: RoomMaster[] = [];
  private inventoryRows: RoomAvailabilityRow[] = [];
  private bookings: any[] = [];
  private nextBmid = 1;
  private nextAvaidd = 1001;

  constructor() {
    this.initData();
  }

  private initData() {
    // Populate physical rooms in roommas (active + 2 inactive)
    this.roommas = [];
    let rId = 1;
    // Type 1: 16 active rooms (101-116), 1 inactive (199)
    for (let i = 1; i <= 16; i++) {
      this.roommas.push({ roomid: rId++, roomno: `10${i < 10 ? '0' + i : i}`, typeid: 1, inactive: 0 });
    }
    this.roommas.push({ roomid: rId++, roomno: '199', typeid: 1, inactive: 1 }); // inactive

    // Type 2: 8 active rooms (201-208)
    for (let i = 1; i <= 8; i++) {
      this.roommas.push({ roomid: rId++, roomno: `20${i}`, typeid: 2, inactive: 0 });
    }

    // Type 3: 12 active rooms (301-312)
    for (let i = 1; i <= 12; i++) {
      this.roommas.push({ roomid: rId++, roomno: `30${i < 10 ? '0' + i : i}`, typeid: 3, inactive: 0 });
    }

    // Type 4: 6 active rooms (401-406)
    for (let i = 1; i <= 6; i++) {
      this.roommas.push({ roomid: rId++, roomno: `40${i}`, typeid: 4, inactive: 0 });
    }

    // Today and next few days
    const today = new Date();
    const d1 = today.toISOString().split('T')[0];
    const d2Obj = new Date(today.getTime() + 2 * 86400000);
    const d2 = d2Obj.toISOString().split('T')[0];
    const d3Obj = new Date(today.getTime() + 3 * 86400000);
    const d3 = d3Obj.toISOString().split('T')[0];
    const d5Obj = new Date(today.getTime() + 5 * 86400000);
    const d5 = d5Obj.toISOString().split('T')[0];

    // Populate trans_roomavailability_chart_datewise
    this.inventoryRows = [
      {
        avaidd: this.nextAvaidd++,
        Roomtypeid: 1,
        irmallotcode: '142',
        fromdate: d1,
        todate: d2,
        Availablerooms: 10,
        irmuploadflg: 0,
        irmnotuploadflg: 0,
      },
      {
        avaidd: this.nextAvaidd++,
        Roomtypeid: 2,
        irmallotcode: '', // Tests fallback to roomtype.irmroomtypeid ('143')!
        fromdate: d2,
        todate: d3,
        Availablerooms: 5,
        irmuploadflg: 0,
        irmnotuploadflg: 0,
      },
      {
        avaidd: this.nextAvaidd++,
        Roomtypeid: 3,
        irmallotcode: '144',
        fromdate: d3,
        todate: d5,
        Availablerooms: 8,
        irmuploadflg: 0,
        irmnotuploadflg: 0,
      },
    ];

    // Seed sample historical bookings
    this.bookings = [
      {
        bmid: this.nextBmid++,
        bkid: 98401,
        booking_reference: 'MG-IRM-7721',
        room_type_id: 142,
        propertyid: 1,
        guest_name: 'Rajesh Sharma',
        guest_email: 'rajesh.sharma@example.com',
        guest_phone: '+91 98401 23456',
        status: 'confirmed',
        special_requests: 'High floor, quiet corner, early arrival at 11 AM',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        update_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        payment_method: 'online',
        payment_status: 'paid',
        payment_gateway: 'Razorpay',
        razorpay_order_id: 'order_Nx8821948',
        adults: 2,
        children: 1,
        room_rent: 7000.0,
        check_in: d1,
        check_out: d3,
        num_rooms: 1,
        num_guests: 3,
        updateflg: 0,
        notupdateflg: 0,
        reason: null,
      },
    ];
  }

  resetMockData() {
    this.initData();
  }

  seedMockInventoryRow(row: Partial<RoomAvailabilityRow>) {
    const today = new Date();
    const d1 = today.toISOString().split('T')[0];
    const d2 = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

    this.inventoryRows.push({
      avaidd: this.nextAvaidd++,
      Roomtypeid: row.Roomtypeid || 1,
      irmallotcode: row.irmallotcode !== undefined ? row.irmallotcode : '142',
      fromdate: row.fromdate || d1,
      todate: row.todate || d2,
      Availablerooms: row.Availablerooms !== undefined ? row.Availablerooms : 6,
      irmuploadflg: 0,
      irmnotuploadflg: 0,
    });
  }

  async connect(): Promise<boolean> {
    this.isConnected = true;
    return true;
  }

  async getApiKey(): Promise<{ apiKey: string; source: 'database' | 'fallback' }> {
    if (this.extraoption.Enablembookingengineintergration === 1 && this.extraoption.Mbookingengineapikey) {
      return { apiKey: this.extraoption.Mbookingengineapikey, source: 'database' };
    }
    return { apiKey: 'IRM-871EC742622E2080B346AF058223597EC935B6425359C986', source: 'fallback' };
  }

  async insertBooking(data: MirmBookingPayload): Promise<{ success: boolean; error: string | null; id?: number }> {
    try {
      const bmid = this.nextBmid++;
      const row = {
        bmid,
        bkid: data.id,
        booking_reference: data.booking_reference,
        room_type_id: Number(data.room_type_id || 0),
        propertyid: Number(data.property_id || 0),
        guest_name: data.guest_name || '',
        guest_email: data.guest_email || '',
        guest_phone: data.guest_phone || '',
        status: data.status || 'confirmed',
        special_requests: data.special_requests || '',
        created_at: data.created_at || new Date().toISOString(),
        update_at: data.updated_at || new Date().toISOString(),
        payment_method: data.payment_method || 'direct',
        payment_status: data.payment_status || 'pending',
        stripe_session_id: data.stripe_session_id || null,
        stripe_payment_id: data.stripe_payment_id || null,
        payment_gateway: data.payment_gateway || null,
        razorpay_order_id: data.razorpay_order_id || null,
        inventrot_reduced: data.inventory_reduced ? 'true' : 'false',
        adults: Number(data.adults || 0),
        children: Number(data.children || 0),
        kids: Number(data.kids || 0),
        extra_beds: Number(data.extra_beds || 0),
        pets: Number(data.pets || 0),
        room_rent: Number(data.room_rent || 0),
        extra_bed_total: Number(data.extra_bed_total || 0),
        kids_total: Number(data.kids_total || 0),
        no_show: data.no_show ? 'true' : 'false',
        no_show_charge: Number(data.no_show_charge || 0),
        walk_in: data.walk_in ? 'true' : 'false',
        web_checkin_completed: data.web_checkin_completed ? 'true' : 'false',
        tentative: data.tentative ? 'true' : 'false',
        tentative_expires_at: data.tentative_expires_at || null,
        lead_time_days: Number(data.lead_time_days || 0),
        room_nos: JSON.stringify(data.room_nos || []),
        check_in: data.check_in || null,
        check_out: data.check_out || null,
        num_rooms: Number(data.num_rooms || 1),
        num_guests: Number(data.num_guests || 1),
        updateflg: 0,
        notupdateflg: 0,
        reason: null,
      };

      this.bookings.unshift(row);
      return { success: true, error: null, id: bmid };
    } catch (err: any) {
      return { success: false, error: err.message || 'Insert failed' };
    }
  }

  async getPendingInventory(limit: number): Promise<{ rows: RoomAvailabilityRow[]; queryError: string | null }> {
    try {
      // Find rows where irmuploadflg is 0
      const pending = this.inventoryRows
        .filter((r) => !r.irmuploadflg || r.irmuploadflg === 0)
        .sort((a, b) => {
          if (a.fromdate !== b.fromdate) return a.fromdate.localeCompare(b.fromdate);
          return a.avaidd - b.avaidd;
        })
        .slice(0, limit);

      // Resolve allotcode like the PHP query:
      // COALESCE(NULLIF(LTRIM(RTRIM(CAST(t.irmallotcode AS varchar(50)))), ''),
      //          NULLIF(LTRIM(RTRIM(CAST(rt.irmroomtypeid AS varchar(50)))), ''))
      const resolvedRows: RoomAvailabilityRow[] = pending.map((row) => {
        const rt = this.roomtypes.find((t) => t.typeid === row.Roomtypeid);
        const code = (row.irmallotcode || '').trim();
        const fallbackCode = rt ? (rt.irmroomtypeid || '').trim() : '';
        const resolved = code !== '' ? code : fallbackCode !== '' ? fallbackCode : '';

        return {
          ...row,
          resolved_allotcode: resolved,
        };
      });

      return { rows: resolvedRows, queryError: null };
    } catch (err: any) {
      return { rows: [], queryError: err.message };
    }
  }

  async getPendingInventoryCount(): Promise<number> {
    return this.inventoryRows.filter((r) => !r.irmuploadflg || r.irmuploadflg === 0).length;
  }

  async getRoomTypeTotal(roomTypeId: number, cache: Map<number, number | null>): Promise<number | null> {
    if (cache.has(roomTypeId)) {
      return cache.get(roomTypeId)!;
    }

    // SELECT COUNT(*) AS total_rooms FROM roommas WHERE typeid = ? AND ISNULL(inactive,0) = 0
    const activeRooms = this.roommas.filter((r) => r.typeid === roomTypeId && (!r.inactive || r.inactive === 0));
    const total = activeRooms.length > 0 ? activeRooms.length : null;

    cache.set(roomTypeId, total);
    return total;
  }

  async updateInventoryFlags(avaidd: number, uploadFlg: number, notUploadFlg: number): Promise<{ success: boolean; rowsAffected: number }> {
    const row = this.inventoryRows.find((r) => r.avaidd === avaidd);
    if (!row) {
      return { success: false, rowsAffected: 0 };
    }
    row.irmuploadflg = uploadFlg;
    row.irmnotuploadflg = notUploadFlg;
    return { success: true, rowsAffected: 1 };
  }

  async getBookings(limit: number = 50): Promise<any[]> {
    return this.bookings.slice(0, limit);
  }

  async getAllInventoryRows(): Promise<RoomAvailabilityRow[]> {
    return [...this.inventoryRows];
  }
}

// Real MSSQL Database Implementation
class MssqlDatabase implements DatabaseAdapter {
  isMock = false;
  isConnected = false;
  error: string | null = null;
  private pool: sql.ConnectionPool | null = null;
  private fallbackAdapter = new MockPmsDatabase();

  constructor(private config: AppConfig) {}

  async connect(): Promise<boolean> {
    try {
      const sqlConfig: sql.config = {
        server: this.config.db.server,
        database: this.config.db.database,
        user: this.config.db.user,
        password: this.config.db.password,
        port: this.config.db.port,
        connectionTimeout: this.config.db.options.connectionTimeout,
        requestTimeout: this.config.db.options.requestTimeout,
        options: {
          encrypt: this.config.db.options.encrypt,
          trustServerCertificate: this.config.db.options.trustServerCertificate,
          enableArithAbort: this.config.db.options.enableArithAbort,
        },
      };

      this.pool = await new sql.ConnectionPool(sqlConfig).connect();
      this.isConnected = true;
      this.error = null;
      console.log(`[MSSQL] Successfully connected to ${this.config.db.server}/${this.config.db.database}`);
      return true;
    } catch (err: any) {
      this.isConnected = false;
      this.error = err.message || 'Failed to connect to MSSQL';
      console.warn(`[MSSQL] Connection warning: ${this.error}. Using fallback adapter for simulation.`);
      return false;
    }
  }

  async getApiKey(): Promise<{ apiKey: string; source: 'database' | 'fallback' }> {
    if (!this.pool || !this.isConnected) {
      return this.fallbackAdapter.getApiKey();
    }
    try {
      const result = await this.pool.request().query(`
        SELECT TOP 1 Mbookingengineapikey
        FROM extraoption
        WHERE ISNULL(Enablembookingengineintergration,0) = 1
      `);

      if (result.recordset && result.recordset.length > 0 && result.recordset[0].Mbookingengineapikey) {
        return { apiKey: result.recordset[0].Mbookingengineapikey, source: 'database' };
      }
      return { apiKey: this.config.irm.fallbackApiKey, source: 'fallback' };
    } catch (err: any) {
      console.error('[MSSQL] Error querying extraoption:', err);
      return { apiKey: this.config.irm.fallbackApiKey, source: 'fallback' };
    }
  }

  async insertBooking(data: MirmBookingPayload): Promise<{ success: boolean; error: string | null; id?: number }> {
    if (!this.pool || !this.isConnected) {
      return this.fallbackAdapter.insertBooking(data);
    }

    const sqlQuery = `
      INSERT INTO Mirm_bookings (
        bkid, booking_reference, room_type_id, propertyid, guest_name,
        guest_email, status, special_requests, created_at, update_at,
        payment_method, payment_status, stripe_session_id, stripe_payment_id,
        payment_gateway, razorpay_order_id, inventrot_reduced,
        adults, children, kids, extra_beds, pets,
        room_rent, extra_bed_total, kids_total,
        no_show, no_show_charge, walk_in, web_checkin_completed,
        tentative, tentative_expires_at, lead_time_days, room_nos,
        updateflg, notupdateflg, reason, check_in, check_out, guest_phone, num_rooms, num_guests
      ) VALUES (
        @bkid, @booking_reference, @room_type_id, @propertyid, @guest_name,
        @guest_email, @status, @special_requests, @created_at, @update_at,
        @payment_method, @payment_status, @stripe_session_id, @stripe_payment_id,
        @payment_gateway, @razorpay_order_id, @inventrot_reduced,
        @adults, @children, @kids, @extra_beds, @pets,
        @room_rent, @extra_bed_total, @kids_total,
        @no_show, @no_show_charge, @walk_in, @web_checkin_completed,
        @tentative, @tentative_expires_at, @lead_time_days, @room_nos,
        0, 0, NULL, @check_in, @check_out, @guest_phone, @num_rooms, @num_guests
      )
    `;

    try {
      const req = this.pool.request();
      req.input('bkid', sql.VarChar, String(data.id || ''));
      req.input('booking_reference', sql.VarChar, String(data.booking_reference || ''));
      req.input('room_type_id', sql.Int, Number(data.room_type_id || 0));
      req.input('propertyid', sql.Int, Number(data.property_id || 0));
      req.input('guest_name', sql.VarChar, data.guest_name || '');
      req.input('guest_email', sql.VarChar, data.guest_email || '');
      req.input('status', sql.VarChar, data.status || '');
      req.input('special_requests', sql.VarChar, data.special_requests || '');
      req.input('created_at', sql.VarChar, data.created_at || new Date().toISOString());
      req.input('update_at', sql.VarChar, data.updated_at || new Date().toISOString());
      req.input('payment_method', sql.VarChar, data.payment_method || '');
      req.input('payment_status', sql.VarChar, data.payment_status || '');
      req.input('stripe_session_id', sql.VarChar, data.stripe_session_id || null);
      req.input('stripe_payment_id', sql.VarChar, data.stripe_payment_id || null);
      req.input('payment_gateway', sql.VarChar, data.payment_gateway || null);
      req.input('razorpay_order_id', sql.VarChar, data.razorpay_order_id || null);
      req.input('inventrot_reduced', sql.VarChar, data.inventory_reduced ? 'true' : 'false');
      req.input('adults', sql.Int, Number(data.adults || 0));
      req.input('children', sql.Int, Number(data.children || 0));
      req.input('kids', sql.Int, Number(data.kids || 0));
      req.input('extra_beds', sql.Int, Number(data.extra_beds || 0));
      req.input('pets', sql.Int, Number(data.pets || 0));
      req.input('room_rent', sql.Decimal(18, 2), Number(data.room_rent || 0));
      req.input('extra_bed_total', sql.Decimal(18, 2), Number(data.extra_bed_total || 0));
      req.input('kids_total', sql.Decimal(18, 2), Number(data.kids_total || 0));
      req.input('no_show', sql.VarChar, data.no_show ? 'true' : 'false');
      req.input('no_show_charge', sql.Decimal(18, 2), Number(data.no_show_charge || 0));
      req.input('walk_in', sql.VarChar, data.walk_in ? 'true' : 'false');
      req.input('web_checkin_completed', sql.VarChar, data.web_checkin_completed ? 'true' : 'false');
      req.input('tentative', sql.VarChar, data.tentative ? 'true' : 'false');
      req.input('tentative_expires_at', sql.VarChar, data.tentative_expires_at || null);
      req.input('lead_time_days', sql.Int, Number(data.lead_time_days || 0));
      req.input('room_nos', sql.VarChar, JSON.stringify(data.room_nos || []));
      req.input('check_in', sql.VarChar, data.check_in || null);
      req.input('check_out', sql.VarChar, data.check_out || null);
      req.input('guest_phone', sql.VarChar, data.guest_phone || null);
      req.input('num_rooms', sql.Int, Number(data.num_rooms || 1));
      req.input('num_guests', sql.Int, Number(data.num_guests || 1));

      await req.query(sqlQuery);
      return { success: true, error: null };
    } catch (err: any) {
      console.error('[MSSQL] insertBooking error:', err);
      return { success: false, error: err.message || 'MSSQL insert failed' };
    }
  }

  async getPendingInventory(limit: number): Promise<{ rows: RoomAvailabilityRow[]; queryError: string | null }> {
    if (!this.pool || !this.isConnected) {
      return this.fallbackAdapter.getPendingInventory(limit);
    }

    try {
      const query = `
        SELECT TOP (${limit}) t.*,
               COALESCE(
                 NULLIF(LTRIM(RTRIM(CAST(t.irmallotcode AS varchar(50)))), ''),
                 NULLIF(LTRIM(RTRIM(CAST(rt.irmroomtypeid AS varchar(50)))), '')
               ) AS resolved_allotcode
        FROM trans_roomavailability_chart_datewise t
        LEFT JOIN roomtype rt ON rt.typeid = t.Roomtypeid
        WHERE ISNULL(t.irmuploadflg,0) = 0
        ORDER BY t.fromdate ASC, t.avaidd ASC
      `;

      const result = await this.pool.request().query(query);
      return { rows: result.recordset || [], queryError: null };
    } catch (err: any) {
      console.error('[MSSQL] getPendingInventory error:', err);
      return { rows: [], queryError: err.message };
    }
  }

  async getPendingInventoryCount(): Promise<number> {
    if (!this.pool || !this.isConnected) {
      return this.fallbackAdapter.getPendingInventoryCount();
    }
    try {
      const res = await this.pool.request().query(`
        SELECT COUNT(*) AS pending_count
        FROM trans_roomavailability_chart_datewise
        WHERE ISNULL(irmuploadflg,0) = 0
      `);
      return res.recordset[0]?.pending_count || 0;
    } catch (err: any) {
      console.error('[MSSQL] getPendingInventoryCount error:', err);
      return 0;
    }
  }

  async getRoomTypeTotal(roomTypeId: number, cache: Map<number, number | null>): Promise<number | null> {
    if (cache.has(roomTypeId)) {
      return cache.get(roomTypeId)!;
    }
    if (!this.pool || !this.isConnected) {
      return this.fallbackAdapter.getRoomTypeTotal(roomTypeId, cache);
    }

    try {
      const req = this.pool.request();
      req.input('typeid', sql.Int, roomTypeId);
      const res = await req.query(`
        SELECT COUNT(*) AS total_rooms
        FROM roommas
        WHERE typeid = @typeid AND ISNULL(inactive,0) = 0
      `);

      const total = Number(res.recordset[0]?.total_rooms || 0);
      const resolved = total > 0 ? total : null;
      cache.set(roomTypeId, resolved);
      return resolved;
    } catch (err: any) {
      console.error('[MSSQL] getRoomTypeTotal error:', err);
      cache.set(roomTypeId, null);
      return null;
    }
  }

  async updateInventoryFlags(avaidd: number, uploadFlg: number, notUploadFlg: number): Promise<{ success: boolean; rowsAffected: number }> {
    if (!this.pool || !this.isConnected) {
      return this.fallbackAdapter.updateInventoryFlags(avaidd, uploadFlg, notUploadFlg);
    }

    try {
      const req = this.pool.request();
      req.input('uploadflg', sql.Int, uploadFlg);
      req.input('notuploadflg', sql.Int, notUploadFlg);
      req.input('avaidd', sql.Int, avaidd);

      const res = await req.query(`
        UPDATE trans_roomavailability_chart_datewise
        SET irmuploadflg = @uploadflg, irmnotuploadflg = @notuploadflg
        WHERE avaidd = @avaidd
      `);

      return { success: true, rowsAffected: res.rowsAffected[0] || 0 };
    } catch (err: any) {
      console.error('[MSSQL] updateInventoryFlags error:', err);
      return { success: false, rowsAffected: 0 };
    }
  }

  async getBookings(limit: number = 50): Promise<any[]> {
    if (!this.pool || !this.isConnected) {
      return this.fallbackAdapter.getBookings(limit);
    }
    try {
      const res = await this.pool.request().query(`
        SELECT TOP (${limit}) *
        FROM Mirm_bookings
        ORDER BY bmid DESC
      `);
      return res.recordset || [];
    } catch (err: any) {
      return this.fallbackAdapter.getBookings(limit);
    }
  }

  async getAllInventoryRows(): Promise<RoomAvailabilityRow[]> {
    if (!this.pool || !this.isConnected) {
      return this.fallbackAdapter.getAllInventoryRows();
    }
    try {
      const res = await this.pool.request().query(`
        SELECT TOP (100) *
        FROM trans_roomavailability_chart_datewise
        ORDER BY avaidd DESC
      `);
      return res.recordset || [];
    } catch (err: any) {
      return this.fallbackAdapter.getAllInventoryRows();
    }
  }

  resetMockData() {
    this.fallbackAdapter.resetMockData();
  }

  seedMockInventoryRow(row: Partial<RoomAvailabilityRow>) {
    this.fallbackAdapter.seedMockInventoryRow(row);
  }
}

// Factory to get configured database instance
let dbInstance: DatabaseAdapter | null = null;

export function getDatabase(appConfig: AppConfig): DatabaseAdapter {
  if (!dbInstance) {
    if (appConfig.db.useMock) {
      dbInstance = new MockPmsDatabase();
    } else {
      dbInstance = new MssqlDatabase(appConfig);
      dbInstance.connect();
    }
  }
  return dbInstance;
}

export function switchDatabaseMode(useMock: boolean, appConfig: AppConfig): DatabaseAdapter {
  if (useMock) {
    dbInstance = new MockPmsDatabase();
  } else {
    dbInstance = new MssqlDatabase(appConfig);
    dbInstance.connect();
  }
  return dbInstance;
}
