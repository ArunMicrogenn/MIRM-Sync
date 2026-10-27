<?php
/**
 * Fetches bookings from the IRM/MHMS API (GET) and inserts each one as a
 * new pending row into Mirm_bookings.
 *
 * ASSUMPTION: the API response is JSON shaped like:
 *   { "bookings": [ { "id": ..., "booking_reference": ..., ... }, ... ] }
 * i.e. each item uses the same field names as your local "bookings" table.
 */

require_once __DIR__ . '/config.php';             // DB_SERVER, DB_USER, DB_PASS, DB_NAME, IRM_API_KEY
require_once __DIR__ . '/insert_mirm_booking.php'; // getDbConnection(), insertMirmBooking(), safe()

/**
 * Runs one full sync pass: fetch from IRM, insert into Mirm_bookings, ack
 * what succeeded. Returns a structured result instead of echoing, so a
 * caller (e.g. index.php) can render it however it wants.
 *
 * Return shape:
 * [
 *   'fetchError'   => string|null,   // set if the IRM GET itself failed
 *   'totalFetched' => int,
 *   'inserted'     => int,
 *   'failed'       => int,
 *   'entries'      => [ ['id' => .., 'reference' => .., 'status' => 'inserted'|'failed', 'message' => ..], ... ],
 *   'ack'          => ['attempted' => bool, 'success' => bool, 'error' => string|null, 'ids' => []],
 * ]
 */
function runMirmSync($dbhandle)
{
    $result = [
        'fetchError'   => null,
        'totalFetched' => 0,
        'inserted'     => 0,
        'failed'       => 0,
        'entries'      => [],
        'ack'          => ['attempted' => false, 'success' => false, 'error' => null, 'ids' => []],
    ];

    $since = urlencode(date('Y-m-d') . 'T00:00:00Z');
    $limit = 50;
    $url = "https://irm.mhms.cloud/api/pms/offline/bookings?since={$since}&limit={$limit}";

    $curl = curl_init();
    curl_setopt_array($curl, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => 'GET',
        CURLOPT_HTTPHEADER => [
            'x-api-key: ' . IRM_API_KEY,
        ],
    ]);

    $response = curl_exec($curl);
    $err = curl_error($curl);
    $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($err) {
        $result['fetchError'] = "cURL error: {$err}";
        error_log("IRM fetch failed (cURL error): {$err}");
        return $result;
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        $result['fetchError'] = "IRM API returned HTTP {$httpCode}";
        error_log("IRM fetch failed (HTTP {$httpCode}): {$response}");
        return $result;
    }

    $data = json_decode($response, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        $result['fetchError'] = 'Invalid JSON from IRM: ' . json_last_error_msg();
        error_log($result['fetchError']);
        return $result;
    }

    $bookings = $data['bookings'] ?? [];
    $result['totalFetched'] = count($bookings);

    if (empty($bookings)) {
        return $result;
    }

    $ackIds = [];

    foreach ($bookings as $booking) {
        $insertResult = insertMirmBooking($dbhandle, $booking);
        $bookingId = safe($booking, 'id', '?');
        $reference = safe($booking, 'booking_reference', '');

        if ($insertResult['success']) {
            $result['inserted']++;
            $ackIds[] = (int) $bookingId;
            $result['entries'][] = [
                'id' => $bookingId, 'reference' => $reference,
                'status' => 'inserted', 'message' => 'Stored successfully',
            ];
        } else {
            $result['failed']++;
            $result['entries'][] = [
                'id' => $bookingId, 'reference' => $reference,
                'status' => 'failed', 'message' => $insertResult['error'],
            ];
        }
    }

    // Acknowledge only the bookings that were successfully inserted, so IRM
    // doesn't keep re-sending ones we failed to store.
    if (!empty($ackIds)) {
        $result['ack']['attempted'] = true;
        $result['ack']['ids'] = $ackIds;

        $ackResult = ackBookings($ackIds);
        $result['ack']['success'] = $ackResult['success'];
        $result['ack']['error'] = $ackResult['error'];

        if (!$ackResult['success']) {
            error_log("IRM ack failed for booking_ids [" . implode(', ', $ackIds) . "]: {$ackResult['error']}");
        }
    }

    return $result;
}

/**
 * Sends an acknowledgement to IRM for the given booking ids.
 * Body: { "booking_ids": [101, 102, 103] }
 */
function ackBookings(array $bookingIds)
{
    $curl = curl_init();
    curl_setopt_array($curl, [
        CURLOPT_URL => 'https://irm.mhms.cloud/api/pms/offline/ack',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => 'POST',
        CURLOPT_POSTFIELDS => json_encode(['booking_ids' => $bookingIds]),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-api-key: ' . IRM_API_KEY,
        ],
    ]);

    $response = curl_exec($curl);
    $err = curl_error($curl);
    $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($err) {
        return ['success' => false, 'error' => "cURL error: {$err}"];
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        return ['success' => false, 'error' => "HTTP {$httpCode}: " . substr((string) $response, 0, 500)];
    }

    return ['success' => true, 'error' => null];
}

// --- Standalone entry point: only runs when this file is hit directly ---
// (e.g. via CLI or browser, for manual testing). When required by index.php
// this block is skipped, and index.php calls runMirmSync() itself.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    ini_set('display_errors', 1);
    error_reporting(E_ALL);
    ini_set('max_execution_time', 0);

    $dbhandle = getDbConnection();
    $result = runMirmSync($dbhandle);

    header('Content-Type: application/json');
    echo json_encode($result, JSON_PRETTY_PRINT);
}
