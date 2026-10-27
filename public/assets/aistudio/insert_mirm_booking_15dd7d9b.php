<?php
/**
 * Receives a booking JSON payload (e.g. from your booking engine / webhook)
 * and inserts it as a new PENDING row into Mirm_bookings, ready to be
 * picked up by irm_sync.php on its next run.
 *
 * Expected payload shape (matches your "bookings" table row):
 *   id, booking_reference, room_type_id, property_id, guest_name, guest_email,
 *   status, special_requests, created_at, updated_at, payment_method,
 *   payment_status, stripe_session_id, stripe_payment_id, payment_gateway,
 *   razorpay_order_id, inventory_reduced, adults, children, kids, extra_beds,
 *   pets, room_rent, extra_bed_total, kids_total, no_show, no_show_charge,
 *   walk_in, web_checkin_completed, tentative, tentative_expires_at,
 *   lead_time_days, room_nos
 *
 * Usage: POST the JSON body to this script, or call insertMirmBooking($data)
 * directly from other PHP code (e.g. right after you insert into `bookings`).
 */

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/config.php'; // DB_SERVER, DB_USER, DB_PASS, DB_NAME

function getDbConnection()
{
    $connStr = "Driver={SQL Server Native Client 11.0};Server=" . DB_SERVER . ";Database=" . DB_NAME . ";";
    $conn = odbc_connect($connStr, DB_USER, DB_PASS);
    if (!$conn) {
        die("DB connection failed: " . odbc_errormsg());
    }
    return $conn;
}

function safe($arr, $key, $default = null)
{
    return isset($arr[$key]) && $arr[$key] !== null ? $arr[$key] : $default;
}

function boolToVarchar($value)
{
    return $value ? 'true' : 'false';
}

/**
 * Inserts one booking payload into Mirm_bookings.
 * Returns ['success' => bool, 'error' => string|null].
 */
function insertMirmBooking($conn, array $data)
{
    // bmid is IDENTITY — never include it in the column list.
    $sql = "
        INSERT INTO Mirm_bookings (
            bkid, booking_reference, room_type_id, propertyid, guest_name,
            guest_email, status, special_requests, created_at, update_at,
            payment_method, payment_status, stripe_session_id, stripe_payment_id,
            payment_gateway, razorpay_order_id, inventrot_reduced,
            adults, children, kids, extra_beds, pets,
            room_rent, extra_bed_total, kids_total,
            no_show, no_show_charge, walk_in, web_checkin_completed,
            tentative, tentative_expires_at, lead_time_days, room_nos,
            updateflg, notupdateflg, reason,check_in,check_out,guest_phone,num_rooms,num_guests
        ) VALUES (
            ?,?,?,?,?,
            ?,?,?,?,?,
            ?,?,?,?,
            ?,?,?,
            ?,?,?,?,?,
            ?,?,?,
            ?,?,?,?,
            ?,?,?,?,
            0,0,NULL,?,?,?,?,?
        )
    ";

    $params = [
        safe($data, 'id'),
        safe($data, 'booking_reference'),
        (int) safe($data, 'room_type_id', 0),
        (int) safe($data, 'property_id', 0),
        safe($data, 'guest_name'),
        safe($data, 'guest_email'),
        safe($data, 'status'),
        safe($data, 'special_requests', ''),
        safe($data, 'created_at'),
        safe($data, 'updated_at'),
        safe($data, 'payment_method'),
        safe($data, 'payment_status'),
        safe($data, 'stripe_session_id'),
        safe($data, 'stripe_payment_id'),
        safe($data, 'payment_gateway'),
        safe($data, 'razorpay_order_id'),
        boolToVarchar(safe($data, 'inventory_reduced', false)),
        (int) safe($data, 'adults', 0),
        (int) safe($data, 'children', 0),
        (int) safe($data, 'kids', 0),
        (int) safe($data, 'extra_beds', 0),
        (int) safe($data, 'pets', 0),
        (float) safe($data, 'room_rent', 0),
        (float) safe($data, 'extra_bed_total', 0),
        (float) safe($data, 'kids_total', 0),
        boolToVarchar(safe($data, 'no_show', false)),
        (float) safe($data, 'no_show_charge', 0),
        boolToVarchar(safe($data, 'walk_in', false)),
        boolToVarchar(safe($data, 'web_checkin_completed', false)),
        boolToVarchar(safe($data, 'tentative', false)),
        safe($data, 'tentative_expires_at'),
        (int) safe($data, 'lead_time_days', 0),
        json_encode(safe($data, 'room_nos', [])),
        safe($data, 'check_in'),
        safe($data, 'check_out'),
        safe($data, 'guest_phone'),
        (int) safe($data, 'num_rooms', 0),
        (int) safe($data, 'num_guests', 0),
    ];

    $stmt = odbc_prepare($conn, $sql);
    if (!$stmt) {
        $error = odbc_errormsg($conn);
        error_log("Mirm_bookings prepare failed: {$error}");
        return ['success' => false, 'error' => $error];
    }

    $ok = odbc_execute($stmt, $params);
    if (!$ok) {
        $error = odbc_errormsg($conn);
        error_log("Mirm_bookings insert failed: {$error} | SQL: {$sql}");
        return ['success' => false, 'error' => $error];
    }

    return ['success' => true, 'error' => null];
}

// --- Entry point: only runs when this file is hit directly (e.g. as a webhook) ---
if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    header('Content-Type: application/json');

    $rawBody = file_get_contents('php://input');
    $data = json_decode($rawBody, true);

    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON payload: ' . json_last_error_msg()]);
        exit;
    }

    $conn = getDbConnection();
    $result = insertMirmBooking($conn, $data);

    http_response_code($result['success'] ? 200 : 500);
    echo json_encode($result);
}
