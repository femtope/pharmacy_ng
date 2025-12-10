<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// ===============================
//  SECURE TOKEN (HIDDEN FROM USERS)
// ===============================
$token = "eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYWNfZXg2eDA1M3ciLCJqdGkiOiI4MjBlOWYyYiJ9.jEOQJgIKSvR40v7RyRpx89QZwLt11DTBZJ2WykET6sE";   

// ===============================
//  READ THE SQL SENT FROM JS
// ===============================
if (!isset($_GET['q'])) {
    echo json_encode(["error" => "No SQL query provided"]);
    exit;
}

$sql = urlencode($_GET['q']);

// ===============================
//  NEW CARTO V3 API URL
// ===============================
$url = "https://gcp-us-east1.api.carto.com/v3/maps/carto_dw/query?format=geojson&q=$sql";

// ===============================
//  PREPARE REQUEST WITH BEARER TOKEN
// ===============================
$opts = [
    "http" => [
        "method" => "GET",
        "header" => "Authorization: Bearer $token"
    ]
];

$context = stream_context_create($opts);

// ===============================
//  FETCH FROM CARTO AND RETURN TO JS
// ===============================
$response = file_get_contents($url, false, $context);

if ($response === FALSE) {
    echo json_encode(["error" => "Failed to connect to CARTO"]);
    exit;
}

echo $response;
?>
