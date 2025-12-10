/****************************************************
 * FINAL main.js - FULLY FEATURED + API PERFORMANCE FIX
 * - Reduced columns in SELECT statement.
 * - Added a LIMIT to initial, unfiltered load.
 ****************************************************/

/* =========================
   CONFIG
   ========================= */
const CARTO_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYWNfZXg2eDA1M3ciLCJqdGkiOiI4MjBlOWYyYiJ9.jEOQJgIKSvR40v7RyRpx89QZwLt11DTBZJ2WykET6sE";
const CARTO_V3_BASE = "https://gcp-us-east1.api.carto.com/v3/maps/carto_dw/query";
const BASE_QUERY_URL = CARTO_V3_BASE; 

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

let ADMIN_CACHE = null;  
let ADMIN_LOADED = false;
/* =========================
   Global variables
   ========================= */
var geoData = null, dataLayer = null, markerGroup = null;
var nigeriaAdminLayer0, nigeriaAdminLayer1, nigeriaAdminLayer2;
var state_layer = null, lga_layer = null;

// Choropleth layers
var lga_population_layer = null;
var info, legend;

/* =========================
   Leaflet Base Layers 
   ========================= */
var osm = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
});
var googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
});
var googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
});


/* =========================
   LEAFLET MAP SETUP 
   ========================= */
var map = L.map("map", {
    center: [9.1, 7.4], 
    zoom: 6,
    layers: [osm], 
    zoomControl: false 
});

// Define base maps for control
var baseMaps = {
    "OSM (Streets)": osm,
    "Google Satellite": googleSat,
    "Google Streets": googleStreets
};

L.control.layers(baseMaps).addTo(map);


var markerCluster = L.markerClusterGroup({
    showCoverageOnHover: false, // <-- ADD this option
    zoomToBoundsOnClick: true,   // <-- Recommended defaults, can be added if needed
    removeOutsideVisibleBounds: true 
});
map.addLayer(markerCluster);


/* =========================
   UTILITY FUNCTIONS
   ========================= */
function dropdownToDbString(val) {
    if (!val || typeof val !== 'string') return val;
    var s = val.trim();

    return s;
}

function sqlEscape(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/'/g, "''");
}

/* =========================
   FETCH DATA FROM CARTO
   ========================= */
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


/* =========================
   SQL BUILDER - OPTIMIZED FOR PERFORMANCE
   ========================= */
function buildQuery(addLimit = false) {
    // 1. PERFORMANCE OPTIMIZATION: Select only the required columns (no more SELECT *)
    let sql =
        "SELECT name_of_pharmacy, address, state, lga, latitude, longitude, verify, phone, status, picture, geom FROM carto-dw-ac-ex6x053w.shared.pharmacy_mapping_data";

    let conditions = [];

    let stateEl = document.getElementById("state_scope");
    let lgaEl = document.getElementById("lga_scope");
    let nameEl = document.getElementById("name_of_pharmacy");

    let state = stateEl ? dropdownToDbString(stateEl.value) : '';
    let lga = lgaEl ? dropdownToDbString(lgaEl.value) : '';
    let name = nameEl ? nameEl.value : '';

    if (state && state.length > 0) {
        conditions.push(`LOWER(state) = LOWER('${sqlEscape(state)}')`);
    }

    if (lga && lga.length > 0 && lga !== "All") {
        conditions.push(`LOWER(lga) = LOWER('${sqlEscape(lga)}')`);
    }

    if (name && name.length > 2) {
        conditions.push(`LOWER(name_of_pharmacy) LIKE LOWER('%${sqlEscape(name)}%')`);
    }

    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }

    // 2. PERFORMANCE OPTIMIZATION: Add LIMIT to the initial load (when no filters are applied)
    // if (addLimit && conditions.length === 0) {
    //     sql += " LIMIT 5000"; // Fetch a maximum of 5000 records for fast initial display
    // }

    return sql;
}

/* =========================
   ADD GEOJSON TO LEAFLET MAP
   ========================= */
function addDataToMap(geojson) {
    markerCluster.clearLayers();

    let validFeaturesCount = 0;

    geojson.features.forEach((feature) => {
        let lat = null;
        let lng = null;

        // Priority 1: Use GeoJSON geometry [lng, lat]
        if (
            feature.geometry &&
            feature.geometry.type === "Point" &&
            feature.geometry.coordinates
        ) {
            lng = parseFloat(feature.geometry.coordinates[0]);
            lat = parseFloat(feature.geometry.coordinates[1]);
        }
        // Priority 2: Fallback to latitude/longitude properties
        else if (feature.properties.latitude && feature.properties.longitude) {
            lat = parseFloat(feature.properties.latitude);
            lng = parseFloat(feature.properties.longitude);
        }

        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return; // skip invalid points
        
        validFeaturesCount++; 

        let popupHtml = buildPopupContent(feature.properties);

        // CHOOSE ICON
        let icon = unverifiedIcon;
        if (
            feature.properties.verify &&
            String(feature.properties.verify).toLowerCase() === "verified"
        ) {
            icon = verifiedIcon;
        }

        let marker = L.marker([lat, lng], { icon: icon })
            .bindPopup(popupHtml)
            // Event listener to open full modal on click
            .on('click', function() {
                // Assuming you have an HTML element with id 'myModal'
                // var modal = document.getElementById('myModal');
                // if (modal) {
                //     modal.style.display = 'block';
                //     // Display the detailed info in the modal
                //     // displayInfo(feature.properties); 
                // }
            });

        markerCluster.addLayer(marker);
    });

    let countEl = document.getElementById("projectCount");
    if (countEl) {
        countEl.innerText = validFeaturesCount;
    }


    if (validFeaturesCount > 0) {
        let bounds = L.latLngBounds([]);

        markerCluster.eachLayer(marker => {
            if(typeof marker.getLatLng === 'function') {
                bounds.extend(marker.getLatLng());
            }
        });

        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}


/* =========================
   POPUP & MODAL CONTENT 
   ========================= */

// Used for quick marker popups
function buildPopupContent(props) {
    let popupHtml = `
        <b>${props.name_of_pharmacy || "Unnamed Pharmacy"}</b><br>
        ${props.picture ? `<img src='${props.picture}' alt='Image not available' height='150' style='width: 100%; object-fit: cover;'><br>` : ''}<br>
        <small>${props.address || "No address"}</small><br>        
        <b>State:</b> ${props.state || "N/A"}<br>
        <b>LGA:</b> ${props.lga || "N/A"}<br>
        <b>Status:</b> ${props.status || "Unknown"}<br>
        <b>Verification:</b> ${props.verify || "Unknown"}<br>
        <b>Phone:</b> ${props.phone || "N/A"}
    `;
    return popupHtml;
}


function contactInfo() {
    var modal = document.getElementById('myModal');
    if (modal) {
        modal.style.display = 'block';
        let contactHtml = `
            <div style="color:black">
                <h4>Contact Us</h4>
                <p>To Print Map Data or Add Your pharmacy Data, contact:</p>
                <p>Email: **Babiplanet@gmail.com**</p>
                <p>Call: **08023352299**</p>
            </div>
        `;
        const infoContentEl = document.getElementById('infoContent');
        if (infoContentEl) {
            infoContentEl.innerHTML = contactHtml;
        }
    }
}

/* ===============================
// ADMIN LAYERS (Boundary Loading/Filtering)
// =============================== */


function addAdminLayersToMap(layers) {
    // REDUCED FILL OPACITY FOR STATE/LGA SELECTION LAYERS TO ALLOW HOVER ON CHOROPLETH
    var layerStyles = {
        'admin0': { "clickable": true, "color": '#B81609', "fillColor": '#ffffff', "weight": 2.0, "opacity": 1, "fillOpacity": 0.01 }, // Very low fill opacity
        'region': { "clickable": true, "color": '#e2095c', "fillColor": '#80FFFFFF', "weight": 2.0, "opacity": 0.7, "fillOpacity": 0.15 }, // Very low fill opacity
        'admin2': { // Added from deobfuscation for completeness
            'clickable': true,
            'color': '#412406',
            'fillColor': '#ffffff',
            'weight': 1.5,
            'opacity': 0.5,
            'fillOpacity': 0.05
        },
        'prefecture': { // Added from deobfuscation for completeness
            'clickable': true,
            'color': '#381CF1',
            'fillColor': '#ffffff',
            'weight': 2.5,
            'opacity': 0.7,
            'fillOpacity': 0.05
        }
    };

    var stateSelect = document.getElementById('state_scope') ? dropdownToDbString(document.getElementById('state_scope').value) : '';
    var lgaSelect = document.getElementById('lga_scope') ? dropdownToDbString(document.getElementById('lga_scope').value) : '';

    // Remove existing layers
    if (nigeriaAdminLayer0) map.removeLayer(nigeriaAdminLayer0);
    if (state_layer) map.removeLayer(state_layer);
    if (lga_layer) map.removeLayer(lga_layer);
    if (lga_population_layer) map.removeLayer(lga_population_layer); 
    
    // 1. Add Admin 0 (National Boundary) - STATIC, BASE LAYER
    if (layers['nigeriaAdmin0']) {
        nigeriaAdminLayer0 = L.geoJson(layers['nigeriaAdmin0'], { style: layerStyles['admin0'] }).addTo(map);
    }
    
    // 2. Add State Layer (for visual filter feedback) - STATIC, LOW INTERACTIVITY
    if (layers['nigeriaAdmin1']) {
        state_layer = L.geoJson(layers['nigeriaAdmin1'], {
            filter: function (feature) {
                // If 'All' is selected, show all boundaries or none. Here we show boundaries if state is selected.
                return (!stateSelect) ? false : (feature.properties && feature.properties.StateName === stateSelect);
            },
            style: layerStyles['region']
        }).addTo(map);
    }

    // 3. Add LGA Layer (for visual filter feedback) - STATIC, LOW INTERACTIVITY
    if (layers['nigeriaAdmin2']) {
        lga_layer = L.geoJson(layers['nigeriaAdmin2'], {
            filter: function (feature) {
                // Only show boundary for the specifically selected LGA
                return (!lgaSelect) ? false : (feature.properties && (feature.properties.LGAName === lgaSelect));
            },
            style: layerStyles['region']
        }).addTo(map);
    }

    // 4. Add Choropleth LGA Layer (Interactive) - THIS MUST BE ADDED LAST TO ENSURE IT RECEIVES MOUSE EVENTS
    if (layers['nigeriaAdmin2']) {
        lga_population_layer = L.geoJson(layers['nigeriaAdmin2'], {
            style: styleByDensity,
            onEachFeature: onEachLGAFeature
        }).addTo(map);
    }
}


function getAdminLayers() {
    if (ADMIN_LOADED && ADMIN_CACHE) {
        addAdminLayersToMap(ADMIN_CACHE);
        return;
    }

    ADMIN_CACHE = {};
    ADMIN_LOADED = true;

    Promise.all([
        fetch('resources/NGR_Admin0.json').then(r => r.json()),
        fetch('resources/NGR_Admin1.json').then(r => r.json()),
        fetch('resources/NGR_Admin2.json').then(r => r.json())
    ])
    .then(([n0, n1, n2]) => {
        ADMIN_CACHE['nigeriaAdmin0'] = n0;
        ADMIN_CACHE['nigeriaAdmin1'] = n1;
        ADMIN_CACHE['nigeriaAdmin2'] = n2;

        addAdminLayersToMap(ADMIN_CACHE);
    })
    .catch(err => console.warn("Admin layer load failed:", err));
}

/* ===============================
// CHOROPLETH FUNCTIONS 
// =============================== */

// Get color based on density (based on values in original code)
function getColor(d) {
    // This assumes your LGA GeoJSON has a property named 'exts_pop_density'
    return d > 1000  ? '#e2095c' : 
           d > 500   ? '#EA98D3' : 
           d > 250   ? '#783F13' : 
           d > 100   ? '#F7CB16' : 
           d > 50    ? '#0B892E' : 
                       '#381CF1'; // Default
}

function styleByDensity(feature) {
    const density = feature.properties.exts_pop_density || -1;
    return {
        weight: 1,
        opacity: -1, // Hidden border until hover
        color: '#666',
        dashArray: '3',
        fillOpacity: 0.3,
        // The property must match your GeoJSON structure
        // fillColor: getColor(feature.properties.exts_pop_density || 0) 
        fillColor: getColor(density)
    };
}

function highlightFeature(e) {
    var layer = e.target;

    layer.setStyle({
        weight: 5,
        color: '#666',
        dashArray: '',
        fillOpacity: 0.7
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }
    
    // Update the info control on hover
    info.update(layer.feature.properties);
}

function resetHighlight(e) {
    lga_population_layer.resetStyle(e.target);
    info.update(); // Clear info control
}

function zoomToFeature(e) {
    map.fitBounds(e.target.getBounds());
}

function onEachLGAFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: zoomToFeature
    });
}

// Initialise the Info Control
info = L.control();
info.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info legend'); // Create a div with a class 'info'
    this.update();
    return this._div;
};

// Method to update the info control content
info.update = function (props) {
    const densityValue = (props && (props.exts_pop_density !== undefined && props.exts_pop_density !== null))
        ? props.exts_pop_density
        : 'N/A';
    
    this._div.innerHTML = '<h4>Population Density</h4>' +  (props ?
        '<b>' + props.LGAName + ', ' + props.StateCode + '</b><br />' + 
        (densityValue === 'N/A' ? 'N/A' : densityValue + ' pop/km<sup>2</sup>')
        : 'Hover over a LGA');


};
info.addTo(map);

// Initialise the Legend Control
legend = L.control({position: 'bottomright'});
legend.onAdd = function (map) {
    var div = L.DomUtil.create('div', 'info legend'),
        grades = [0, 50, 100, 250, 500, 1000],
        labels = [],
        from, to;

    for (var i = 0; i < grades.length; i++) {
        from = grades[i];
        to = grades[i + 1];

        labels.push(
            '<i style="background:' + getColor(from + 1) + '"></i> ' +
            from + (to ? '&ndash;' + to : '+'));
    }

    div.innerHTML = '<h4>Pop Density</h4>' + labels.join('<br>');
    return div;
};
legend.addTo(map);


/* =========================
   UI HANDLERS - UPDATED
   ========================= */
function triggerUiUpdate() {
    // When filters are applied, do NOT limit the results (addLimit = false)
    const sql = buildQuery(false);
    
    // 1. Update CSV Download Link 
    // let download_query = sql.replace('SELECT *', 'SELECT *') + "&format=CSV";
    // const queryEl = document.getElementById('downloadLink'); 
    // if (queryEl) {
    //     queryEl.setAttribute("href", `${CARTO_V3_BASE}?format=csv&q=${encodeURIComponent(sql)}`);
    // }

    // 2. Refresh Map Data
    getData(sql);

    // 3. Re-filter admin layers
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


/* ===============================
// INITIAL LOAD - UPDATED FOR PERFORMANCE
// =============================== */
document.addEventListener('DOMContentLoaded', function () {
    // Load admin layers (boundaries) and markers
    getAdminLayers();
    
    // Initial data load for markers - PASS 'true' to apply the LIMIT for speed
    const sql = buildQuery(true);
    getData(sql);

    // Initialise the CSV download link with the limited query
    // triggerUiUpdate();
    // const downloadLinkEl = document.getElementById('downloadLink');
    // if (downloadLinkEl) {
    //     downloadLinkEl.setAttribute(
    //         "href",
    //         `${CARTO_V3_BASE}?format=csv&q=${encodeURIComponent(sql)}`
    //     );
    // }

    // Hook up modal close (assuming 'myModal' and a close button '.close')
    var modal = document.getElementById('myModal');
    var span = document.getElementsByClassName('close')[0];
    if (span) {
        span.onclick = function () {
            if (modal) modal.style.display = 'none';
        };
    }
});



/* =========================
   DOWNLOAD JSON (WORKING FORMAT)
   ========================= */
async function triggerJSONDownload() {
    showLoader();
    
    try {
        // Build the full query (no limit, fetch all)
        const sqlQuery = buildQuery(false); 

        // Fetch data using the WORKING 'json' format
        // Use 'json' format and include the access_token in the URL
        const apiUrl = 
            `${CARTO_V3_BASE}?format=json&q=${encodeURIComponent(sqlQuery)}&access_token=${CARTO_TOKEN}`;

        const response = await fetch(apiUrl, {
            method: "GET",
            headers: { "Authorization": "Bearer " + CARTO_TOKEN },
        });

        if (!response.ok) {
            throw new Error(`CARTO download request failed: ${response.status}`);
        }

        const data = await response.json();
        
        // Open a new window with the raw JSON data
        const jsonString = JSON.stringify(data, null, 2);
        const newWindow = window.open();
        newWindow.document.write('<pre>' + jsonString + '</pre>');
        newWindow.document.title = 'Pharmacy Data JSON';
        
    } catch (err) {
        console.error("JSON Download Error:", err);
        alert("Failed to fetch JSON: " + (err.message || "An unknown error occurred. Check the console."));
    } finally {
        hideLoader();
    }
}
