<?php
/**
 * IRM Syncing Services — front-end status page.
 * Runs one Mirm_bookings sync pass and renders a structured, professional
 * status view (summary badges + itemized results table) instead of dumping
 * raw console text.
 */

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
ini_set('max_execution_time', 0);

date_default_timezone_set('Asia/Kolkata');
header("Refresh: 200"); // auto-reload this page every 200s to trigger the next sync pass
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");
$refreshedAt = date("d-m-y H:i:s");

require_once __DIR__ . '/fetch_and_insert_mirm_bookings.php';
require_once __DIR__ . '/push_room_inventory.php';

$dbhandle = getDbConnection();
$sync = runMirmSync($dbhandle);
$inv = pushRoomInventory($dbhandle);

$hasError = $sync['fetchError'] !== null;
$hasEntries = !empty($sync['entries']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IRM Syncing Services</title>
    <style>
        :root {
            --navy: #1a3a8f;
            --gold: #e7a13a;
            --ink: #1f2430;
            --muted: #6b7280;
            --border: #e5e7eb;
            --page-bg: #f4f5f7;
            --card-bg: #ffffff;
            --accent: #16a596;
            --accent-dark: #0f8c7f;
            --green: #1a9b6c;
            --green-bg: #e8f7f0;
            --red: #c0392b;
            --red-bg: #fbeaea;
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            background: var(--page-bg);
            font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
            color: var(--ink);
            min-height: 100vh;
        }

        .topbar {
            background: var(--navy);
            color: #fff;
            padding: 14px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 14px;
            letter-spacing: 0.02em;
        }

        .topbar .brand {
            font-weight: 600;
            font-size: 15px;
        }

        .topbar .timestamp {
            color: rgba(255,255,255,0.8);
            font-variant-numeric: tabular-nums;
        }

        .wrap {
            max-width: 760px;
            margin: 0 auto;
            padding: 48px 24px 64px;
        }

        .card {
            background: var(--card-bg);
            border-radius: 10px;
            border: 1px solid var(--border);
            box-shadow: 0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04);
            padding: 40px 40px 32px;
            text-align: center;
        }

        .logo-fallback {
            font-weight: 800;
            font-size: 24px;
            letter-spacing: 0.3px;
            margin-bottom: 4px;
        }
        .logo-fallback .mg { color: var(--navy); }
        .logo-fallback .enn { color: var(--gold); }
        .logo-sub {
            font-size: 11px;
            color: var(--muted);
            letter-spacing: 0.04em;
            margin-bottom: 28px;
        }

        h1 {
            font-size: 22px;
            font-weight: 700;
            margin: 0 0 28px;
            color: var(--ink);
        }

        .spinner-wrap {
            width: 92px;
            height: 92px;
            border-radius: 50%;
            background: <?= $hasError ? 'var(--red)' : 'var(--accent)' ?>;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 3px solid rgba(255,255,255,0.35);
            border-top-color: #ffffff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
            .spinner { animation: none; }
        }

        .check-icon {
            color: #fff;
            font-size: 40px;
            line-height: 1;
        }

        h2 {
            font-size: 17px;
            font-weight: 600;
            margin: 0 0 6px;
        }

        .status-line {
            font-size: 13px;
            color: var(--muted);
            margin: 0 0 28px;
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 24px;
        }

        .stat {
            border-radius: 8px;
            padding: 14px 8px;
            border: 1px solid var(--border);
        }
        .stat .num {
            font-size: 22px;
            font-weight: 700;
            line-height: 1.1;
        }
        .stat .label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--muted);
            margin-top: 4px;
        }
        .stat.fetched .num { color: var(--navy); }
        .stat.inserted { background: var(--green-bg); border-color: #cdeee0; }
        .stat.inserted .num { color: var(--green); }
        .stat.failed { background: <?= $sync['failed'] > 0 ? 'var(--red-bg)' : '#f9fafb' ?>; border-color: <?= $sync['failed'] > 0 ? '#f3d3ce' : 'var(--border)' ?>; }
        .stat.failed .num { color: <?= $sync['failed'] > 0 ? 'var(--red)' : 'var(--muted)' ?>; }

        .fetch-error {
            text-align: left;
            background: var(--red-bg);
            border: 1px solid #f3d3ce;
            color: var(--red);
            border-radius: 8px;
            padding: 14px 16px;
            font-size: 13px;
            margin-bottom: 24px;
        }

        .results {
            text-align: left;
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
        }

        .results table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .results thead th {
            background: #f9fafb;
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--muted);
            padding: 10px 14px;
            border-bottom: 1px solid var(--border);
        }

        .results tbody td {
            padding: 10px 14px;
            border-bottom: 1px solid var(--border);
            vertical-align: top;
        }
        .results tbody tr:last-child td { border-bottom: none; }

        .badge {
            display: inline-block;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 9px;
            border-radius: 100px;
            letter-spacing: 0.02em;
        }
        .badge.ok { background: var(--green-bg); color: var(--green); }
        .badge.err { background: var(--red-bg); color: var(--red); }

        .ack-note {
            text-align: left;
            font-size: 12px;
            color: var(--muted);
            margin-top: 16px;
        }
        .ack-note.err { color: var(--red); }

        .empty-note {
            font-size: 13px;
            color: var(--muted);
            padding: 18px 0 0;
        }
    </style>
</head>
<body>

    <div class="topbar">
        <span class="brand">MICROGENN &middot; IRM Syncing Services</span>
        <span class="timestamp">Last run: <?= htmlspecialchars($refreshedAt) ?></span>
    </div>

    <div class="wrap">
        <div class="card">
            <div class="logo-fallback"><span class="mg">MG</span> MICRO<span class="enn">GENN</span></div>
            <div class="logo-sub">Empowering Your Hotel's Digital Evolution</div>

            <h1>IRM Syncing Services</h1>

            <div class="spinner-wrap">
                <?php if ($hasError): ?>
                    <span class="check-icon">&#33;</span>
                <?php else: ?>
                    <div class="spinner"></div>
                <?php endif; ?>
            </div>

            <h2><?= $hasError ? 'Sync could not complete' : 'Syncing is on process' ?></h2>
            <p class="status-line">Next refresh in ~200s &middot; <?= htmlspecialchars($refreshedAt) ?></p>

            <?php if ($hasError): ?>
                <div class="fetch-error">
                    <strong>Fetch error:</strong> <?= htmlspecialchars($sync['fetchError']) ?>
                </div>
            <?php else: ?>
                <div class="stats">
                    <div class="stat fetched">
                        <div class="num"><?= (int) $sync['totalFetched'] ?></div>
                        <div class="label">Fetched</div>
                    </div>
                    <div class="stat inserted">
                        <div class="num"><?= (int) $sync['inserted'] ?></div>
                        <div class="label">Inserted</div>
                    </div>
                    <div class="stat failed">
                        <div class="num"><?= (int) $sync['failed'] ?></div>
                        <div class="label">Failed</div>
                    </div>
                </div>

                <?php if ($hasEntries): ?>
                    <div class="results">
                        <table>
                            <thead>
                                <tr>
                                    <th>Booking ID</th>
                                    <th>Reference</th>
                                    <th>Status</th>
                                    <th>Detail</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($sync['entries'] as $entry): ?>
                                    <tr>
                                        <td><?= htmlspecialchars((string) $entry['id']) ?></td>
                                        <td><?= htmlspecialchars((string) $entry['reference']) ?></td>
                                        <td>
                                            <?php if ($entry['status'] === 'inserted'): ?>
                                                <span class="badge ok">Inserted</span>
                                            <?php else: ?>
                                                <span class="badge err">Failed</span>
                                            <?php endif; ?>
                                        </td>
                                        <td><?= htmlspecialchars((string) $entry['message']) ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>

                    <?php if ($sync['ack']['attempted']): ?>
                        <p class="ack-note <?= $sync['ack']['success'] ? '' : 'err' ?>">
                            <?php if ($sync['ack']['success']): ?>
                                Acknowledged <?= count($sync['ack']['ids']) ?> booking(s) with IRM: <?= htmlspecialchars(implode(', ', $sync['ack']['ids'])) ?>
                            <?php else: ?>
                                Acknowledgement failed: <?= htmlspecialchars((string) $sync['ack']['error']) ?>
                            <?php endif; ?>
                        </p>
                    <?php endif; ?>
                <?php else: ?>
                    <p class="empty-note">No bookings returned on this pass.</p>
                <?php endif; ?>
            <?php endif; ?>
        </div>

        <div class="card" style="margin-top: 24px;">
            <h1 style="margin-bottom: 20px;">Room Inventory Sync</h1>

            <p class="status-line">Last run: <?= htmlspecialchars($refreshedAt) ?></p>

            <?php if ($inv['queryError']): ?>
                <div class="fetch-error">
                    <strong>Query error:</strong> <?= htmlspecialchars($inv['queryError']) ?>
                </div>
            <?php else: ?>
            <p class="status-line" style="margin-bottom: 16px;">
                <?= (int) $inv['totalPending'] ?> row(s) currently pending in total
                <?php if ($inv['totalPending'] > $inv['processed']): ?>
                    &mdash; only <?= (int) $inv['processed'] ?> processed this pass, backlog will continue over the next few refreshes
                <?php endif; ?>
            </p>
            <div class="stats">
                <div class="stat fetched">
                    <div class="num"><?= (int) $inv['processed'] ?></div>
                    <div class="label">Processed</div>
                </div>
                <div class="stat inserted">
                    <div class="num"><?= (int) $inv['updated'] ?></div>
                    <div class="label">Updated</div>
                </div>
                <div class="stat failed">
                    <div class="num"><?= (int) $inv['failed'] ?></div>
                    <div class="label">Failed</div>
                </div>
            </div>

            <?php if (!empty($inv['entries'])): ?>
                <div class="results">
                    <table>
                        <thead>
                            <tr>
                                <th>Avaidd</th>
                                <th>Room Type</th>
                                <th>Status</th>
                                <th>Detail</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($inv['entries'] as $entry): ?>
                                <tr>
                                    <td><?= htmlspecialchars((string) $entry['avaidd']) ?></td>
                                    <td><?= htmlspecialchars((string) $entry['allotcode']) ?></td>
                                    <td>
                                        <?php if ($entry['status'] === 'updated'): ?>
                                            <span class="badge ok">Updated</span>
                                        <?php else: ?>
                                            <span class="badge err">Failed</span>
                                        <?php endif; ?>
                                    </td>
                                    <td><?= htmlspecialchars((string) $entry['message']) ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php else: ?>
                <p class="empty-note">No pending inventory rows on this pass.</p>
            <?php endif; ?>
            <?php endif; ?>
        </div>
    </div>

</body>
</html>
