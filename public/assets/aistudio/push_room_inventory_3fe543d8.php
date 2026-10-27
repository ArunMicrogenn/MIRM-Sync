<?php
/**
 * Pushes pending room-availability rows to the IRM/MHMS inventory API.
 *
 * Source table: trans_roomavailability_chart_datewise
 *   Reads rows where ISNULL(irmuploadflg,0) = 0 (not yet pushed).
 *   Each row has a date RANGE (fromdate..todate) with one availability count,
 *   which is expanded into one API entry per day, e.g.:
 *     { "room_type_id": 142, "date": "2026-10-27", "total_rooms": 16, "available_rooms": 10 }
 *
 * HOW THE VALUES ARE RESOLVED
 *   - room_type_id = the row's irmallotcode if filled, otherwise
 *     roomtype.irmroomtypeid (joined on roomtype.typeid = Roomtypeid).
 *     The local Roomtypeid is the PMS's internal id and is never sent to IRM.
 *   - total_rooms = number of active rooms of that room type (COUNT(*) on
 *     roommas, typeid = local Roomtypeid, inactive rooms excluded). It must be
 *     the room type's fixed total, not the available count, otherwise IRM
 *     sees "sold = 0" and can drop available_rooms.
 *   - available_rooms = Availablerooms from the row.
 *
 * FLAGS (primary key column is avaidd)
 *   - pushed OK:                      irmuploadflg = 1, irmnotuploadflg = 0
 *   - rejected, or cannot be mapped:  irmuploadflg = 1, irmnotuploadflg = 1
 *     (stops the row being re-selected every pass, but keeps it flagged)
 *
 * NOTE: written for an older PHP (no ?? operator, no list() shorthand).
 */

require_once __DIR__ . '/config.php';             // DB_SERVER, DB_USER, DB_PASS, DB_NAME, IRM_API_KEY
require_once __DIR__ . '/insert_mirm_booking.php'; // getDbConnection(), safe() — shared, not redefined here

/**
 * Looks up the TRUE total room count for a room type by counting physical
 * rooms in the `roommas` table (one row per room), excluding inactive ones.
 *
 * Pass the LOCAL Roomtypeid here, not the IRM id — roommas.typeid follows
 * your internal room-type numbering.
 *
 * ASSUMPTIONS TO CONFIRM against your schema:
 *   - roommas has `typeid` matching the local Roomtypeid
 *   - roommas has an `inactive` flag (1 = inactive, 0/NULL = active)
 *
 * Results are cached per run in $totalsCache so each room type is queried once.
 */
function getRoomTypeTotal($dbhandle, $roomTypeId, array &$totalsCache)
{
    if (array_key_exists($roomTypeId, $totalsCache)) {
        return $totalsCache[$roomTypeId];
    }

    $stmt = runQuery(
        $dbhandle,
        "SELECT COUNT(*) AS total_rooms FROM roommas WHERE typeid = ? AND ISNULL(inactive,0) = 0",
        array($roomTypeId)
    );

    if ($stmt === false) {
        $totalsCache[$roomTypeId] = null;
        return null;
    }

    $row = odbc_fetch_array($stmt);
    $total = (int) safe($row, 'total_rooms', 0);

    // A count of 0 almost certainly means the typeid matched nothing (or every
    // room is inactive) rather than a real 0-room type — treat it as unknown so
    // the caller fails loudly instead of pushing total_rooms = 0 to IRM.
    $totalsCache[$roomTypeId] = $total > 0 ? $total : null;

    return $totalsCache[$roomTypeId];
}

function runQuery($conn, $sql, $params = array())
{
    $stmt = odbc_prepare($conn, $sql);
    if (!$stmt) {
        error_log("Prepare failed: " . odbc_errormsg($conn) . " | SQL: " . $sql);
        return false;
    }
    $ok = odbc_execute($stmt, $params);
    if (!$ok) {
        error_log("Execute failed: " . odbc_errormsg($conn) . " | SQL: " . $sql);
        return false;
    }
    return $stmt;
}

/** Inclusive list of Y-m-d date strings between $from and $to */
function buildDateRange($from, $to)
{
    $dates = array();
    $start = new DateTime($from);
    $end = new DateTime($to);

    if ($start > $end) {
        return array($from); // malformed range, fall back to a single date
    }

    while ($start <= $end) {
        $dates[] = $start->format('Y-m-d');
        $start->modify('+1 day');
    }

    return $dates;
}

/**
 * Sends one row's expanded date-range as an inventory update to IRM.
 * Returns array('success' => bool, 'error' => string|null, 'raw' => response).
 */
function pushInventoryEntries(array $entries)
{
    $curl = curl_init();
    curl_setopt_array($curl, array(
        CURLOPT_URL => 'https://irm.mhms.cloud/api/pms/offline/inventory',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => 'POST',
        CURLOPT_POSTFIELDS => json_encode(array('data' => $entries)),
        CURLOPT_HTTPHEADER => array(
            'x-api-key: ' . IRM_API_KEY,
            'Content-Type: application/json',
        ),
    ));

    $response = curl_exec($curl);
    $err = curl_error($curl);
    $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $redirectCount = curl_getinfo($curl, CURLINFO_REDIRECT_COUNT);
    $effectiveUrl = curl_getinfo($curl, CURLINFO_EFFECTIVE_URL);
    curl_close($curl);

    if ($redirectCount > 0) {
        error_log("Inventory DEBUG: request was redirected {$redirectCount} time(s), ended at {$effectiveUrl} — a redirect can silently drop the POST body/method on some servers.");
    }

    if ($err) {
        return array('success' => false, 'error' => "cURL error: {$err}");
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        return array('success' => false, 'error' => "HTTP {$httpCode}: " . substr((string) $response, 0, 500));
    }

    return array('success' => true, 'error' => null, 'raw' => $response);
}

/**
 * Runs one full inventory-push pass over up to $limit pending rows.
 * Returns a structured result:
 * array(
 *   'processed' => int, 'updated' => int, 'failed' => int,
 *   'entries'   => array( array('avaidd' => .., 'allotcode' => .., 'status' => 'updated'|'failed', 'message' => ..), ... ),
 *   'queryError' => string|null, 'totalPending' => int,
 * )
 */
function pushRoomInventory($dbhandle, $limit = 20)
{
    $limit = (int) $limit; // interpolated into SQL below, so force an integer

    $result = array(
        'processed' => 0, 'updated' => 0, 'failed' => 0, 'entries' => array(),
        'queryError' => null, 'totalPending' => 0,
    );

    // Caches room type => total_rooms lookups for this pass.
    $totalsCache = array();

    // How many rows are waiting in total, regardless of the batch limit, so a
    // backlog bigger than $limit is visible instead of hidden.
    $countStmt = runQuery(
        $dbhandle,
        "SELECT COUNT(*) AS pending_count FROM trans_roomavailability_chart_datewise WHERE ISNULL(irmuploadflg,0) = 0"
    );
    if ($countStmt !== false) {
        $countRow = odbc_fetch_array($countStmt);
        $result['totalPending'] = (int) safe($countRow, 'pending_count', 0);
    }

    // JOIN to roomtype (master) so the IRM room type id still resolves when the
    // row's own irmallotcode is not filled.
    //
    // FIX: a plain COALESCE(t.irmallotcode, rt.irmroomtypeid) never falls back
    // when irmallotcode holds an EMPTY STRING or spaces (SSMS shows those as
    // blank cells, unlike a true NULL), because '' is not NULL. NULLIF(LTRIM(RTRIM(..)),'')
    // turns blank values into NULL first. Both sides are cast to varchar so
    // COALESCE never tries to convert text into the other column's number type.
    //
    // FIX: ORDER BY fromdate alone is not unique, so rows with the same date
    // could come back in a different order each pass. avaidd breaks the tie.
    $stmt = runQuery(
        $dbhandle,
        "SELECT TOP {$limit} t.*,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(CAST(t.irmallotcode AS varchar(50)))), ''),
                    NULLIF(LTRIM(RTRIM(CAST(rt.irmroomtypeid AS varchar(50)))), '')
                ) AS resolved_allotcode
         FROM trans_roomavailability_chart_datewise t
         LEFT JOIN roomtype rt ON rt.typeid = t.Roomtypeid
         WHERE ISNULL(t.irmuploadflg,0) = 0
         ORDER BY t.fromdate ASC, t.avaidd ASC"
    );

    if ($stmt === false) {
        $result['queryError'] = odbc_errormsg($dbhandle) ? odbc_errormsg($dbhandle) : 'Query failed — check table/column names exist and match exactly (trans_roomavailability_chart_datewise, roomtype, irmuploadflg).';
        return $result;
    }

    while ($row = odbc_fetch_array($stmt)) {
        $result['processed']++;

        $avaidd = safe($row, 'avaidd');
        $localRoomTypeId = safe($row, 'Roomtypeid');    // PMS internal id: used only to look up roommas totals
        $allotcode = safe($row, 'resolved_allotcode');  // IRM room_type_id: the only id sent to IRM
        $fromDate = safe($row, 'fromdate');
        $toDate = safe($row, 'todate');
        $availableRooms = (int) safe($row, 'Availablerooms', 0);

        $dates = buildDateRange($fromDate, $toDate);

        // Skip the API call when there is no usable IRM room type — it would
        // only fail with a foreign-key error. trim() matters: a stray space is
        // not "empty" to PHP, and (int)" " would send room_type_id 0.
        $allotcodeTrimmed = trim((string) $allotcode);
        if ($allotcodeTrimmed === '' || (int) $allotcodeTrimmed <= 0) {
            runQuery(
                $dbhandle,
                "UPDATE trans_roomavailability_chart_datewise SET irmuploadflg = 1, irmnotuploadflg = 1 WHERE avaidd = ?",
                array($avaidd)
            );

            $result['failed']++;
            $result['entries'][] = array(
                'avaidd' => $avaidd, 'allotcode' => $allotcode,
                'status' => 'failed', 'message' => 'Skipped — no IRM room type id (blank on the row and on the roomtype master), not sent to IRM',
            );
            error_log("Inventory: skipped avaidd={$avaidd}, no IRM room type id on row or roomtype master.");
            continue;
        }

        // total_rooms is the room type's fixed inventory, looked up by LOCAL Roomtypeid.
        $totalRooms = getRoomTypeTotal($dbhandle, (int) $localRoomTypeId, $totalsCache);

        if ($totalRooms === null) {
            // Don't guess: a wrong total_rooms would overwrite the real total in IRM.
            runQuery(
                $dbhandle,
                "UPDATE trans_roomavailability_chart_datewise SET irmuploadflg = 1, irmnotuploadflg = 1 WHERE avaidd = ?",
                array($avaidd)
            );

            $result['failed']++;
            $result['entries'][] = array(
                'avaidd' => $avaidd, 'allotcode' => $allotcode,
                'status' => 'failed',
                'message' => "Could not resolve a total-room count for local Roomtypeid {$localRoomTypeId} from roommas (0 active rooms found, or typeid mismatch) — check the roommas.typeid values and inactive flag.",
            );
            error_log("Inventory: could not resolve room total for local Roomtypeid={$localRoomTypeId}, avaidd={$avaidd}.");
            continue;
        }

        $roomTypeId = (int) $allotcodeTrimmed;

        $entries = array();
        foreach ($dates as $date) {
            $entries[] = array(
                'room_type_id'    => $roomTypeId,
                'date'            => $date,
                'total_rooms'     => $totalRooms,
                'available_rooms' => $availableRooms,
            );
        }

        $pushResult = pushInventoryEntries($entries);

        // DEBUG: exact payload and raw response per row, for comparing with a
        // known-working Postman request. Remove once no longer needed — this
        // writes two log lines per row on every pass.
        error_log("Inventory DEBUG avaidd={$avaidd} payload=" . json_encode(array('data' => $entries)));
        error_log("Inventory DEBUG avaidd={$avaidd} success=" . ($pushResult['success'] ? '1' : '0')
            . " raw=" . (isset($pushResult['raw']) ? $pushResult['raw'] : (isset($pushResult['error']) ? $pushResult['error'] : 'null')));

        if ($pushResult['success']) {
            $update = runQuery(
                $dbhandle,
                "UPDATE trans_roomavailability_chart_datewise SET irmuploadflg = 1, irmnotuploadflg = 0 WHERE avaidd = ?",
                array($avaidd)
            );

            $rowsAffected = ($update !== false) ? odbc_num_rows($update) : 0;

            if ($rowsAffected > 0) {
                $result['updated']++;
                $result['entries'][] = array(
                    'avaidd' => $avaidd, 'allotcode' => $allotcode,
                    'status' => 'updated', 'message' => count($dates) . " date(s) pushed",
                );
            } else {
                // Push succeeded but the flag UPDATE matched zero rows (avaidd
                // value/type mismatch). The row will be re-fetched and re-pushed
                // every run until that is fixed.
                $result['failed']++;
                $result['entries'][] = array(
                    'avaidd' => $avaidd, 'allotcode' => $allotcode,
                    'status' => 'failed',
                    'message' => 'Pushed to IRM but UPDATE matched 0 rows (avaidd mismatch?) — will retry and may duplicate',
                );
                error_log("Inventory: UPDATE matched 0 rows for avaidd={$avaidd} — check column type/value match.");
            }
        } else {
            // IRM rejected the push. irmuploadflg = 1 stops this row blocking the
            // queue; irmnotuploadflg = 1 keeps it visibly flagged as failed.
            runQuery(
                $dbhandle,
                "UPDATE trans_roomavailability_chart_datewise SET irmuploadflg = 1, irmnotuploadflg = 1 WHERE avaidd = ?",
                array($avaidd)
            );

            $result['failed']++;
            $result['entries'][] = array(
                'avaidd' => $avaidd, 'allotcode' => $allotcode,
                'status' => 'failed', 'message' => $pushResult['error'],
            );
            error_log("Inventory push failed for avaidd {$avaidd}: {$pushResult['error']}");
        }
    }

    return $result;
}

// --- Standalone entry point: only runs when this file is hit directly ---
// (e.g. via CLI/cron, or a browser hit for manual testing).
if (basename(isset($_SERVER['SCRIPT_FILENAME']) ? $_SERVER['SCRIPT_FILENAME'] : '') === basename(__FILE__)) {
    ini_set('display_errors', 1);
    error_reporting(E_ALL);
    ini_set('max_execution_time', 0);

    $dbhandle = getDbConnection();
    $result = pushRoomInventory($dbhandle);

    // Persist the result + timestamp so index.php can display it without
    // having to run the sync itself.
    $statusDir = __DIR__ . '/storage';
    if (!is_dir($statusDir)) {
        mkdir($statusDir, 0755, true);
    }
    file_put_contents(
        $statusDir . '/inventory_status.json',
        json_encode(array('ranAt' => date('c'), 'result' => $result), JSON_PRETTY_PRINT)
    );

    if (php_sapi_name() !== 'cli') {
        header('Content-Type: application/json');
    }
    echo json_encode($result, JSON_PRETTY_PRINT);
}
