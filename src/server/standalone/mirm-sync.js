/**
 * MICROGENN · IRM Syncing Services (Node.js Unit)
 * Converted from PHP sync scripts:
 *   - config.php
 *   - fetch_and_insert_mirm_bookings.php
 *   - insert_mirm_booking.php
 *   - push_room_inventory.php
 *   - index.php
 *
 * Requirements: Node.js 18+ (built-in fetch support)
 * Run: npm install && node mirm-sync.js
 */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');
require('dotenv').config();

// ==========================================
// 1. CONFIGURATION & ENVIRONMENT
// ==========================================
const DB_SERVER = process.env.IRM_DB_SERVER || 'admin-pc\\sqlexpress';
const DB_NAME   = process.env.IRM_DB_NAME   || 'vpi3108';
const DB_USER   = process.env.IRM_DB_USER   || 'sa';
const DB_PASS   = process.env.IRM_DB_PASS   || 'mgenn';
const DB_PORT   = parseInt(process.env.IRM_DB_PORT || '1433', 10);

const IRM_BASE_URL = process.env.IRM_BASE_URL || 'https://irm.mhms.cloud';
const IRM_API_KEY_FALLBACK = process.env.IRM_API_KEY || 'IRM-871EC742622E2080B346AF058223597EC935B6425359C986';
const SYNC_INTERVAL_SECONDS = parseInt(process.env.IRM_SYNC_INTERVAL || '200', 10);

const sqlConfig = {
  server: DB_SERVER,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASS,
  port: DB_PORT,
  options: {
    encrypt: process.env.IRM_DB_ENCRYPT === 'true',
    trustServerCertificate: true,
    enableArithAbort: true,
    connectionTimeout: 15000,
    requestTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let dbPool = null;

async function getDbConnection() {
  if (!dbPool) {
    dbPool = await new sql.ConnectionPool(sqlConfig).connect();
    console.log(`[DB] Connected to MSSQL Server: ${DB_SERVER} -> ${DB_NAME}`);
  }
  return dbPool;
}

function safe(obj, key, defaultValue = null) {
  return obj && obj[key] !== undefined && obj[key] !== null ? obj[key] : defaultValue;
}

function boolToVarchar(val) {
  return val ? 'true' : 'false';
}

function buildDateRange(from, to) {
  const dates = [];
  const start = new Date(from);
  const end = new Date(to);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [from];
  }

  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ==========================================
// 2. DYNAMIC API KEY RESOLVER
// ==========================================
async function resolveApiKey(pool) {
  try {
    const res = await pool.request().query(`
      SELECT TOP 1 Mbookingengineapikey
      FROM extraoption
      WHERE ISNULL(Enablembookingengineintergration,0) = 1
    `);
    if (res.recordset && res.recordset.length > 0 && res.recordset[0].Mbookingengineapikey) {
      return res.recordset[0].Mbookingengineapikey;
    }
  } catch (err) {
    console.warn(`[Config] Failed to query extraoption for apiKey, using fallback: ${err.message}`);
  }
  return IRM_API_KEY_FALLBACK;
}

// ==========================================
// 3. BOOKING INSERT & SYNC SERVICE
// ==========================================
async function insertMirmBooking(pool, data) {
  const insertQuery = `
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
    const req = pool.request();
    req.input('bkid', sql.VarChar, String(safe(data, 'id', '')));
    req.input('booking_reference', sql.VarChar, String(safe(data, 'booking_reference', '')));
    req.input('room_type_id', sql.Int, parseInt(safe(data, 'room_type_id', 0), 10));
    req.input('propertyid', sql.Int, parseInt(safe(data, 'property_id', 0), 10));
    req.input('guest_name', sql.VarChar, safe(data, 'guest_name', ''));
    req.input('guest_email', sql.VarChar, safe(data, 'guest_email', ''));
    req.input('status', sql.VarChar, safe(data, 'status', ''));
    req.input('special_requests', sql.VarChar, safe(data, 'special_requests', ''));
    req.input('created_at', sql.VarChar, safe(data, 'created_at', new Date().toISOString()));
    req.input('update_at', sql.VarChar, safe(data, 'updated_at', new Date().toISOString()));
    req.input('payment_method', sql.VarChar, safe(data, 'payment_method', ''));
    req.input('payment_status', sql.VarChar, safe(data, 'payment_status', ''));
    req.input('stripe_session_id', sql.VarChar, safe(data, 'stripe_session_id', null));
    req.input('stripe_payment_id', sql.VarChar, safe(data, 'stripe_payment_id', null));
    req.input('payment_gateway', sql.VarChar, safe(data, 'payment_gateway', null));
    req.input('razorpay_order_id', sql.VarChar, safe(data, 'razorpay_order_id', null));
    req.input('inventrot_reduced', sql.VarChar, boolToVarchar(safe(data, 'inventory_reduced', false)));
    req.input('adults', sql.Int, parseInt(safe(data, 'adults', 0), 10));
    req.input('children', sql.Int, parseInt(safe(data, 'children', 0), 10));
    req.input('kids', sql.Int, parseInt(safe(data, 'kids', 0), 10));
    req.input('extra_beds', sql.Int, parseInt(safe(data, 'extra_beds', 0), 10));
    req.input('pets', sql.Int, parseInt(safe(data, 'pets', 0), 10));
    req.input('room_rent', sql.Decimal(18, 2), parseFloat(safe(data, 'room_rent', 0)));
    req.input('extra_bed_total', sql.Decimal(18, 2), parseFloat(safe(data, 'extra_bed_total', 0)));
    req.input('kids_total', sql.Decimal(18, 2), parseFloat(safe(data, 'kids_total', 0)));
    req.input('no_show', sql.VarChar, boolToVarchar(safe(data, 'no_show', false)));
    req.input('no_show_charge', sql.Decimal(18, 2), parseFloat(safe(data, 'no_show_charge', 0)));
    req.input('walk_in', sql.VarChar, boolToVarchar(safe(data, 'walk_in', false)));
    req.input('web_checkin_completed', sql.VarChar, boolToVarchar(safe(data, 'web_checkin_completed', false)));
    req.input('tentative', sql.VarChar, boolToVarchar(safe(data, 'tentative', false)));
    req.input('tentative_expires_at', sql.VarChar, safe(data, 'tentative_expires_at', null));
    req.input('lead_time_days', sql.Int, parseInt(safe(data, 'lead_time_days', 0), 10));
    req.input('room_nos', sql.VarChar, JSON.stringify(safe(data, 'room_nos', [])));
    req.input('check_in', sql.VarChar, safe(data, 'check_in', null));
    req.input('check_out', sql.VarChar, safe(data, 'check_out', null));
    req.input('guest_phone', sql.VarChar, safe(data, 'guest_phone', null));
    req.input('num_rooms', sql.Int, parseInt(safe(data, 'num_rooms', 0), 10));
    req.input('num_guests', sql.Int, parseInt(safe(data, 'num_guests', 0), 10));

    await req.query(insertQuery);
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function ackBookings(bookingIds, apiKey) {
  try {
    const res = await fetch(`${IRM_BASE_URL}/api/pms/offline/ack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ booking_ids: bookingIds }),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      return { success: false, error: `HTTP ${res.status}: ${errTxt.slice(0, 300)}` };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function runMirmSync(pool, apiKey) {
  const result = {
    fetchError: null,
    totalFetched: 0,
    inserted: 0,
    failed: 0,
    entries: [],
    ack: { attempted: false, success: false, error: null, ids: [] },
  };

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const since = encodeURIComponent(`${y}-${m}-${d}T00:00:00Z`);
  const limit = 50;
  const url = `${IRM_BASE_URL}/api/pms/offline/bookings?since=${since}&limit=${limit}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      result.fetchError = `IRM API returned HTTP ${res.status}: ${body.slice(0, 300)}`;
      console.error(`[Bookings] ${result.fetchError}`);
      return result;
    }

    const data = await res.json();
    const bookings = data.bookings || [];
    result.totalFetched = bookings.length;

    if (bookings.length === 0) {
      return result;
    }

    const ackIds = [];

    for (const b of bookings) {
      const bookingId = safe(b, 'id', '?');
      const reference = safe(b, 'booking_reference', '');
      const insRes = await insertMirmBooking(pool, b);

      if (insRes.success) {
        result.inserted++;
        ackIds.push(parseInt(bookingId, 10));
        result.entries.push({ id: bookingId, reference, status: 'inserted', message: 'Stored successfully' });
      } else {
        result.failed++;
        result.entries.push({ id: bookingId, reference, status: 'failed', message: insRes.error });
      }
    }

    if (ackIds.length > 0) {
      result.ack.attempted = true;
      result.ack.ids = ackIds;
      const ackRes = await ackBookings(ackIds, apiKey);
      result.ack.success = ackRes.success;
      result.ack.error = ackRes.error;

      if (!ackRes.success) {
        console.error(`[Bookings] Ack failed for [${ackIds.join(', ')}]: ${ackRes.error}`);
      }
    }
  } catch (err) {
    result.fetchError = `Fetch error: ${err.message}`;
    console.error(`[Bookings] ${result.fetchError}`);
  }

  return result;
}

// ==========================================
// 4. ROOM INVENTORY SYNC SERVICE
// ==========================================
async function getRoomTypeTotal(pool, roomTypeId, totalsCache) {
  if (totalsCache.has(roomTypeId)) {
    return totalsCache.get(roomTypeId);
  }

  try {
    const req = pool.request();
    req.input('typeid', sql.Int, roomTypeId);
    const res = await req.query(`
      SELECT COUNT(*) AS total_rooms
      FROM roommas
      WHERE typeid = @typeid AND ISNULL(inactive,0) = 0
    `);
    const total = parseInt(res.recordset[0]?.total_rooms || 0, 10);
    const resolved = total > 0 ? total : null;
    totalsCache.set(roomTypeId, resolved);
    return resolved;
  } catch (err) {
    console.error(`[Inventory] getRoomTypeTotal error for ${roomTypeId}: ${err.message}`);
    totalsCache.set(roomTypeId, null);
    return null;
  }
}

async function pushInventoryEntries(entries, apiKey) {
  try {
    const res = await fetch(`${IRM_BASE_URL}/api/pms/offline/inventory`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: entries }),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      return { success: false, error: `HTTP ${res.status}: ${errTxt.slice(0, 300)}` };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function pushRoomInventory(pool, apiKey, limit = 20) {
  const result = {
    processed: 0,
    updated: 0,
    failed: 0,
    entries: [],
    queryError: null,
    totalPending: 0,
  };

  const totalsCache = new Map();

  try {
    const countRes = await pool.request().query(`
      SELECT COUNT(*) AS pending_count
      FROM trans_roomavailability_chart_datewise
      WHERE ISNULL(irmuploadflg,0) = 0
    `);
    result.totalPending = parseInt(countRes.recordset[0]?.pending_count || 0, 10);

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

    const batchRes = await pool.request().query(query);
    const rows = batchRes.recordset || [];

    for (const row of rows) {
      result.processed++;
      const avaidd = row.avaidd;
      const localRoomTypeId = parseInt(row.Roomtypeid, 10);
      const allotcode = row.resolved_allotcode;
      const fromDate = row.fromdate;
      const toDate = row.todate;
      const availableRooms = parseInt(row.Availablerooms || 0, 10);

      const dates = buildDateRange(fromDate, toDate);
      const allotcodeTrimmed = String(allotcode || '').trim();

      if (!allotcodeTrimmed || parseInt(allotcodeTrimmed, 10) <= 0) {
        await pool.request()
          .input('avaidd', sql.Int, avaidd)
          .query(`UPDATE trans_roomavailability_chart_datewise SET irmuploadflg = 1, irmnotuploadflg = 1 WHERE avaidd = @avaidd`);

        result.failed++;
        result.entries.push({
          avaidd,
          allotcode,
          status: 'failed',
          message: 'Skipped — no IRM room type id (blank on row and roomtype master)',
        });
        continue;
      }

      const totalRooms = await getRoomTypeTotal(pool, localRoomTypeId, totalsCache);

      if (totalRooms === null) {
        await pool.request()
          .input('avaidd', sql.Int, avaidd)
          .query(`UPDATE trans_roomavailability_chart_datewise SET irmuploadflg = 1, irmnotuploadflg = 1 WHERE avaidd = @avaidd`);

        result.failed++;
        result.entries.push({
          avaidd,
          allotcode,
          status: 'failed',
          message: `Could not resolve a total-room count for local Roomtypeid ${localRoomTypeId} from roommas`,
        });
        continue;
      }

      const roomTypeId = parseInt(allotcodeTrimmed, 10);
      const entries = dates.map((date) => ({
        room_type_id: roomTypeId,
        date,
        total_rooms: totalRooms,
        available_rooms: availableRooms,
      }));

      const pushRes = await pushInventoryEntries(entries, apiKey);

      if (pushRes.success) {
        const updateRes = await pool.request()
          .input('avaidd', sql.Int, avaidd)
          .query(`UPDATE trans_roomavailability_chart_datewise SET irmuploadflg = 1, irmnotuploadflg = 0 WHERE avaidd = @avaidd`);

        if ((updateRes.rowsAffected[0] || 0) > 0) {
          result.updated++;
          result.entries.push({
            avaidd,
            allotcode,
            status: 'updated',
            message: `${dates.length} date(s) pushed`,
          });
        } else {
          result.failed++;
          result.entries.push({
            avaidd,
            allotcode,
            status: 'failed',
            message: 'Pushed to IRM but UPDATE matched 0 rows (avaidd mismatch?)',
          });
        }
      } else {
        await pool.request()
          .input('avaidd', sql.Int, avaidd)
          .query(`UPDATE trans_roomavailability_chart_datewise SET irmuploadflg = 1, irmnotuploadflg = 1 WHERE avaidd = @avaidd`);

        result.failed++;
        result.entries.push({
          avaidd,
          allotcode,
          status: 'failed',
          message: pushRes.error,
        });
      }
    }
  } catch (err) {
    result.queryError = err.message;
    console.error(`[Inventory] Query error: ${err.message}`);
  }

  return result;
}

// ==========================================
// 5. MAIN SCHEDULER & RUNNER
// ==========================================
async function runSingleCycle() {
  const timestamp = new Date().toISOString();
  console.log(`\n============================================================`);
  console.log(`[MIRM Sync Pass] Executing pass at ${timestamp}`);
  console.log(`============================================================`);

  try {
    const pool = await getDbConnection();
    const apiKey = await resolveApiKey(pool);
    console.log(`[Key] Active IRM API Key: ${apiKey.substring(0, 10)}...`);

    const bookingResult = await runMirmSync(pool, apiKey);
    console.log(`[Bookings] Fetched: ${bookingResult.totalFetched} | Inserted: ${bookingResult.inserted} | Failed: ${bookingResult.failed}`);

    const inventoryResult = await pushRoomInventory(pool, apiKey, 20);
    console.log(`[Inventory] Processed: ${inventoryResult.processed} | Updated: ${inventoryResult.updated} | Failed: ${inventoryResult.failed} | Remaining Pending: ${inventoryResult.totalPending}`);

    // Persist status JSON matching PHP storage/inventory_status.json
    const storageDir = path.join(__dirname, 'storage');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(storageDir, 'sync_status.json'),
      JSON.stringify({ timestamp, bookings: bookingResult, inventory: inventoryResult }, null, 2)
    );

    console.log(`[Done] Pass finished. Next cycle in ${SYNC_INTERVAL_SECONDS} seconds.\n`);
  } catch (err) {
    console.error(`[Error] Unhandled exception during sync pass: ${err.message}`, err);
  }
}

async function main() {
  console.log(`Starting MICROGENN IRM Sync Unit (Node.js)...`);
  console.log(`Interval: Every ${SYNC_INTERVAL_SECONDS} seconds`);

  // Run initial pass immediately
  await runSingleCycle();

  // Schedule continuous background execution
  setInterval(runSingleCycle, SYNC_INTERVAL_SECONDS * 1000);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal crash:', err);
    process.exit(1);
  });
}

module.exports = {
  getDbConnection,
  runMirmSync,
  pushRoomInventory,
  insertMirmBooking,
  resolveApiKey,
};
