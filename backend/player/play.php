<?php
// play.php - Simple redirect to custom player
session_start();

$playData = isset($_GET['play']) ? json_decode(base64_decode($_GET['play']), true) : null;

if (!$playData || !isset($playData['id']) || !isset($playData['timestamp'])) {
    header('Location: /browse.html');
    exit;
}

// Token expiry check (2 hours)
$currentTime = time();
$tokenTime = intval($playData['timestamp'] / 1000);
$tokenAge = $currentTime - $tokenTime;

if ($tokenAge > 7200) {
    die('This link has expired. Please go back and request a new one.');
}

// Redirect to custom player
$encodedData = base64_encode(json_encode($playData));
header("Location: /php/player/custom-player.php?token=" . urlencode($encodedData));
exit;
?>