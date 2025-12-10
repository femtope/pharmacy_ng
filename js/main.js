/****************************************************
 * FINAL COMBINED main.js
 * Combines the clean structure (Code A) with the
 * advanced features (Code B: Admin Layers, SQL Utilities).
 ****************************************************/

// ===============================
// CARTO SETTINGS
// ===============================
const CARTO_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYWNfZXg2eDA1M3ciLCJqdGkiOiI4MjBlOWYyYiJ9.jEOQJgIKSvR40v7RyRpx89QZwLt11DTBZJ2WykET6sE"; 
const BASE_QUERY_URL = "https://gcp-us-east1.api.carto.com/v3/maps/carto_dw/query";

const verifiedIcon = L.icon({
    iconUrl: "image/verified.png",
    iconSize: [35, 35],
    iconAnchor: [17, 34]
});

const unverifiedIcon = L.icon({
    iconUrl: "image/unverified.png",
    iconSize: [35, 35],
    iconAnchor: [17, 34]
});

// ===============================
// GLOBAL VARIABLES (From Code B, required for Admin Layers)
// ===============================
var dataLayer = null; // Used to hold the pharmacy GeoJSON layer
var nigeriaAdminLayer0, nigeriaAdminLayer1, nigeriaAdminLayer2; // For boundary files
var state_layer = null, lga_layer = null; // For currently active boundary layers


// ===============================
// LEAFLET MAP SETUP
// ===============================
var map = L.map("map").setView([9.1, 7.4], 6); // Nigeria center

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
}).addTo(map);

var markerCluster = L.markerClusterGroup();
map.addLayer(markerCluster);


// ===============================
// UTILITY FUNCTIONS (From Code B)
// ===============================

// Convert dropdown token value to DB-friendly state string: "Akwa_Ibom" -> "Akwa Ibom"
function dropdownToDbString(val) {
    if (!val || typeof val !== 'string') return val;
    var s = val.trim().replace(/_/g, ' ');
    // Handle FCT case if needed by your DB
    if (s.toUpperCase() === 'FCT ABUJA') {
        s = 'FCT'; 
    }
    return s;
}

// Safe SQL string escape for single quotes
function sqlEscape(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/'/g, "''");
}


// ===============================
// FETCH DATA FROM CARTO
// ===============================
async function getData(sqlQuery) {
    showLoader();

    const apiUrl =
        BASE_QUERY_URL +
        "?format=geojson&q=" +
        encodeURIComponent(sqlQuery);

    try {
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + CARTO_TOKEN,
            },
        });

        if (!response.ok) {
             console.error("CARTO API Error Status:", response.status);
             throw new Error("CARTO request failed. Check Token!");
        }

        const geojson = await response.json();

        hideLoader();
        addDataToMap(geojson);

    } catch (err) {
        hideLoader();
        console.error("Error fetching data:", err);
    }
}


// ===============================
// SQL BUILDER (State, LGA, Name) - Updated to use Utilities
// ===============================
function buildQuery() {
    let sql =
        "SELECT * FROM carto-dw-ac-ex6x053w.shared.pharmacy_mapping_data";

    let conditions = [];

    // Defensive check and use of dropdownToDbString
    let stateEl = document.getElementById("state_scope");
    let lgaEl = document.getElementById("lga_scope");
    let nameEl = document.getElementById("name_of_pharmacy");

    let state = stateEl ? dropdownToDbString(stateEl.value) : '';
    let lga = lgaEl ? dropdownToDbString(lgaEl.value) : '';
    let name = nameEl ? nameEl.value : '';


    if (state && state.length > 0) {
        // Use sqlEscape and LOWER for robust, case-insensitive query
        conditions.push(`LOWER(state) = LOWER('${sqlEscape(state)}')`);
    }

    if (lga && lga.length > 0 && lga !== "All") {
        conditions.push(`LOWER(lga) = LOWER('${sqlEscape(lga)}')`);
    }

    if (name && name.length > 2) {
        // Use sqlEscape and LIKE for partial matching
        conditions.push(`LOWER(name_of_pharmacy) LIKE LOWER('%${sqlEscape(name)}%')`);
    }

    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }

    return sql;
}


// ===============================
// ADD GEOJSON TO LEAFLET MAP (Code A structure, confirmed working)
// ===============================
function addDataToMap(geojson) {
    markerCluster.clearLayers();

    let validFeaturesCount = 0;

    geojson.features.forEach((feature) => {
        let lat = null;
        let lng = null;

        // --------------------------------------
        // PRIORITY #1 — Use GeoJSON geometry [lng, lat]
        // --------------------------------------
        if (
            feature.geometry &&
            feature.geometry.type === "Point" &&
            feature.geometry.coordinates
        ) {
            lng = parseFloat(feature.geometry.coordinates[0]);
            lat = parseFloat(feature.geometry.coordinates[1]);
        }
        
        // --------------------------------------
        // PRIORITY #3 — If only latitude/longitude properties
        // --------------------------------------
        else if (feature.properties.latitude && feature.properties.longitude) {
            lat = parseFloat(feature.properties.latitude);
            lng = parseFloat(feature.properties.longitude);
        }

        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return; // skip invalid points
        
        validFeaturesCount++; // Count only valid points

        let popupHtml = `
            <b>${feature.properties.name_of_pharmacy || "Unnamed Pharmacy"}</b><br>
            <small>${feature.properties.address || "No address"}</small><br>
            <b>State:</b> ${feature.properties.state}<br>
            <b>LGA:</b> ${feature.properties.lga}<br>
            <b>Status:</b> ${feature.properties.status || "Unknown"}<br>
            <b>Verification:</b> ${feature.properties.verify || "Unknown"}
        `;

        // ===============================
        // CHOOSE ICON
        // ===============================
        let icon = unverifiedIcon;

        if (
            feature.properties.verify &&
            String(feature.properties.verify).toLowerCase() === "verified"
        ) {
            icon = verifiedIcon;
        }

        let marker = L.marker([lat, lng], { icon: icon }).bindPopup(popupHtml);
        markerCluster.addLayer(marker);
    });

    // Update count based on valid features added
    let countEl = document.getElementById("projectCount");
    if (countEl) {
        countEl.innerText = validFeaturesCount;
    }


    if (validFeaturesCount > 0) {
        // Fit bounds to clustered markers
        let bounds = L.latLngBounds([]);

        markerCluster.eachLayer(marker => {
            // Check if marker is a leaf marker (has getLatLng function)
            if(typeof marker.getLatLng === 'function') {
                bounds.extend(marker.getLatLng());
            }
        });

        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}


// ===============================
// ADMIN LAYERS (From Code B)
// ===============================
function addAdminLayersToMap(layers) {
    var layerStyles = {
        'admin0': { "clickable": true, "color": '#B81609', "fillColor": '#ffffff', "weight": 2.0, "opacity": 1, "fillOpacity": 0.05 },
        'region': { "clickable": true, "color": '#e2095c', "fillColor": '#80FFFFFF', "weight": 2.0, "opacity": 0.7, "fillOpacity": 0.05 }
    };

    var stateSelect = document.getElementById('state_scope') ? document.getElementById('state_scope').value : '';
    var lgaSelect = document.getElementById('lga_scope') ? document.getElementById('lga_scope').value : '';

    // Remove existing layers
    if (nigeriaAdminLayer0) try { map.removeLayer(nigeriaAdminLayer0); } catch (e) {}
    if (state_layer) try { map.removeLayer(state_layer); } catch (e) {}
    if (lga_layer) try { map.removeLayer(lga_layer); } catch (e) {}

    // Add Admin 0 (National Boundary)
    if (layers['nigeriaAdmin0']) {
        nigeriaAdminLayer0 = L.geoJson(layers['nigeriaAdmin0'], { style: layerStyles['admin0'] }).addTo(map);
    }
    
    // Add Admin 1 (State Boundaries)
    if (layers['nigeriaAdmin1']) {
        state_layer = L.geoJson(layers['nigeriaAdmin1'], {
            filter: function (feature) {
                var dbState = dropdownToDbString(stateSelect || '');
                // Filters to show only the selected state, or all if none selected
                return (!dbState) ? true : (feature.properties && feature.properties.StateName === dbState);
            },
            style: layerStyles['region']
        }).addTo(map);
    }
    
    // Add Admin 2 (LGA Boundaries)
    if (layers['nigeriaAdmin2']) {
        lga_layer = L.geoJson(layers['nigeriaAdmin2'], {
            filter: function (feature) {
                var dbLga = dropdownToDbString(lgaSelect || '');
                // Filters to show only the selected LGA
                return (!dbLga) ? true : (feature.properties && (feature.properties.LGAName === dbLga));
            },
            style: layerStyles['region']
        }).addTo(map);
    }
}

function getAdminLayers() {
    var adminLayers = {};
    // **CRITICAL: Ensure these three GeoJSON files exist in your 'resources/' folder**
    fetch('resources/NGR_Admin0.json').then(r => r.json()).then(n0 => {
        adminLayers['nigeriaAdmin0'] = n0;
        return fetch('resources/NGR_Admin1.json');
    }).then(r => r.json()).then(n1 => {
        adminLayers['nigeriaAdmin1'] = n1;
        return fetch('resources/NGR_Admin2.json');
    }).then(r => r.json()).then(n2 => {
        adminLayers['nigeriaAdmin2'] = n2;
        addAdminLayersToMap(adminLayers);
    }).catch(err => {
        console.warn("Admin layers load failed. Check 'resources/' folder and file names.", err);
    });
}


// ===============================
// UI HANDLERS
// ===============================
function triggerUiUpdate() {
    const sql = buildQuery();
    getData(sql);
    // Re-filter admin layers on every UI update
    getAdminLayers(); 
}

function facilityName() {
    // Only update if input is >= 3 chars, or is cleared
    let name = document.getElementById('name_of_pharmacy') ? document.getElementById('name_of_pharmacy').value : '';
    if (name.length > 2 || name.length === 0) {
        triggerUiUpdate();
    }
}

// Loader icons
function showLoader() {
    let loader = document.getElementById("spinposition");
    if (loader) loader.style.display = "block";
}

function hideLoader() {
    let loader = document.getElementById("spinposition");
    if (loader) loader.style.display = "none";
}


// ===============================
// INITIAL LOAD (Switched to DOMContentLoaded for faster startup)
// ===============================
document.addEventListener('DOMContentLoaded', function () {
    // Load admin layers (boundaries)
    getAdminLayers();
    
    // Initial data load for markers
    const sql = buildQuery();
    getData(sql);
});
