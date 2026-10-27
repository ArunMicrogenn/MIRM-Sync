<?php
/**
 * Local configuration — DO NOT commit this file to git.
 * Add "config.php" to .gitignore.
 *
 * Values below are placeholders; replace with your real environment values,
 * ideally read from environment variables instead of hardcoding them here:
 *   define('DB_SERVER', getenv('IRM_DB_SERVER'));
 */

define('DB_SERVER', 'admin-pc\sqlexpress');
define('DB_NAME',   'vpi3108');
define('DB_USER',   'sa');
define('DB_PASS',   'mgenn'); // rotate this — it was previously hardcoded/exposed in source

/**
 * IRM_API_KEY is read from extraoption.mbookingengineapikey rather than
 * hardcoded, so rotating the key in the database is enough — no code change
 * needed. Falls back to the literal below only if that lookup fails, so a
 * missing/misconfigured row doesn't quietly break every API call.
 */
$irmApiKeyFallback = 'IRM-871EC742622E2080B346AF058223597EC935B6425359C986'; // rotate this too — was previously exposed in source
$irmApiKeyResolved = $irmApiKeyFallback;

$configConnStr = "Driver={SQL Server Native Client 11.0};Server=" . DB_SERVER . ";Database=" . DB_NAME . ";";
$configConn = @odbc_connect($configConnStr, DB_USER, DB_PASS);

if ($configConn) {
   echo  $configStmt = odbc_prepare($configConn, "
        SELECT TOP 1 Mbookingengineapikey
        FROM extraoption
        WHERE ISNULL(Enablembookingengineintergration,0) = 1
    ");

    if ($configStmt && odbc_execute($configStmt)) {
        $configRow = odbc_fetch_array($configStmt);
        if (!empty($configRow['Mbookingengineapikey'])) {
            $irmApiKeyResolved = $configRow['Mbookingengineapikey'];
        } else {
            error_log('config.php: extraoption.mbookingengineapikey was empty/NULL, using fallback IRM_API_KEY.');
        }
    } else {
        error_log('config.php: could not query extraoption for mbookingengineapikey, using fallback IRM_API_KEY.');
    }

    odbc_close($configConn);
} else {
    error_log('config.php: DB connection failed while resolving IRM_API_KEY, using fallback.');
}

define('IRM_API_KEY', $irmApiKeyResolved);
unset($irmApiKeyFallback, $irmApiKeyResolved, $configConnStr, $configConn, $configStmt, $configRow);
