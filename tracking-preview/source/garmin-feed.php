<?php
declare(strict_types=1);

const GARMIN_CACHE_SECONDS = 120;
const GARMIN_STALE_SECONDS = 600;
const GARMIN_MAX_BYTES = 2097152;

function fail_response(int $status, string $message): void {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo $message;
    exit;
}

function allowed_target(string $target): bool {
    $parts = parse_url($target);
    if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['pass'])
        || isset($parts['port']) || isset($parts['query']) || isset($parts['fragment'])) return false;
    $host = strtolower((string)($parts['host'] ?? ''));
    $path = strtolower((string)($parts['path'] ?? ''));
    $loader = $host === 'share.garmin.com' && $path === '/feed/shareloader/missionamerica';
    $feed = preg_match('/^[-a-z0-9]+-share\.explore\.garmin\.com$/D', $host) === 1
        && $path === '/feed/share/missionamerica';
    $inreachIii = $host === 'aus-share.explore.garmin.com'
        && $path === '/feed/share/missionamerica50';
    return $loader || $feed || $inreachIii;
}

function fetch_target(string $target): ?string {
    if (!function_exists('curl_init')) return null;
    $handle = curl_init($target);
    if ($handle === false) return null;
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER => ['Accept: application/vnd.google-earth.kml+xml, application/xml, text/xml'],
        CURLOPT_USERAGENT => 'GoodwinMissionAmerica-GarminKML/1.0',
    ]);
    $body = curl_exec($handle);
    $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $type = strtolower((string)curl_getinfo($handle, CURLINFO_CONTENT_TYPE));
    curl_close($handle);
    if (!is_string($body) || $status !== 200 || strlen($body) > GARMIN_MAX_BYTES
        || preg_match('/^(application\/(vnd\.google-earth\.kml\+xml|xml)|text\/xml)(\s*;|$)/', $type) !== 1) return null;
    return $body;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    fail_response(405, 'method_not_allowed');
}
$target = isset($_GET['url']) && is_string($_GET['url']) ? $_GET['url'] : '';
if (!allowed_target($target)) fail_response(400, 'invalid_garmin_target');

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR
    . 'ggma-garmin-' . hash('sha256', $target) . '.kml';
$lock = @fopen($cachePath . '.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX)) fail_response(503, 'garmin_feed_unavailable');
$cached = is_file($cachePath) ? @file_get_contents($cachePath) : false;
$modified = is_file($cachePath) ? @filemtime($cachePath) : false;
$age = is_int($modified) ? time() - $modified : PHP_INT_MAX;
$body = is_string($cached) && $age < GARMIN_CACHE_SECONDS ? $cached : fetch_target($target);
$state = 'fresh';
if (is_string($body) && $body !== '' && (!is_string($cached) || $body !== $cached || $age >= GARMIN_CACHE_SECONDS)) {
    $temporary = $cachePath . '.' . getmypid() . '.tmp';
    if (@file_put_contents($temporary, $body, LOCK_EX) !== false && !@rename($temporary, $cachePath)) @unlink($temporary);
} elseif ((!is_string($body) || $body === '') && is_string($cached) && $age < GARMIN_STALE_SECONDS) {
    $body = $cached;
    $state = 'stale';
}
flock($lock, LOCK_UN);
fclose($lock);
if (!is_string($body) || $body === '') fail_response(503, 'garmin_feed_unavailable');

header('Content-Type: application/vnd.google-earth.kml+xml; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Content-Type-Options: nosniff');
header('X-Garmin-Cache: ' . $state);
echo $body;
