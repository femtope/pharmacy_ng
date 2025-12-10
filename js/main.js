/****************************************************
 *  NEW main.js for CARTO v3 API
 *  Clean, modern, readable version
 *  Works with:
 *   - state filter
 *   - lga filter
 *   - pharmacy name filter
 *  Uses Leaflet + MarkerCluster
 ****************************************************/

// ===============================
// CARTO SETTINGS
// ===============================
const CARTO_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYWNfZXg2eDA1M3ciLCJqdGkiOiI4MjBlOWYyYiJ9.jEOQJgIKSvR40v7RyRpx89QZwLt11DTBZJ2WykET6sE"; 
const BASE_QUERY_URL =
  "https://gcp-us-east1.api.carto.com/v3/maps/carto_dw/query";

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
// LEAFLET MAP SETUP
// ===============================
var map = L.map("map").setView([9.1, 7.4], 6); // Nigeria center

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

var markerCluster = L.markerClusterGroup();
map.addLayer(markerCluster);


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

    if (!response.ok) throw new Error("CARTO request failed");

    const geojson = await response.json();

    hideLoader();
    addDataToMap(geojson);

  } catch (err) {
    hideLoader();
    console.error("Error:", err);
  }
}

// ===============================
// SQL BUILDER (State, LGA, Name)
// ===============================
function buildQuery() {
  let sql =
    "SELECT * FROM carto-dw-ac-ex6x053w.shared.pharmacy_mapping_data";

  let conditions = [];

  let state = document.getElementById("state_scope").value;
  let lga = document.getElementById("lga_scope").value;
  let name = document.getElementById("name_of_pharmacy").value;

  if (state && state.length > 0) {
    conditions.push(`state = '${state}'`);
  }

  if (lga && lga.length > 0 && lga !== "All") {
    conditions.push(`lga = '${lga}'`);
  }

  if (name && name.length > 2) {
    conditions.push(`LOWER(name_of_pharmacy) LIKE LOWER('%${name}%')`);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  return sql;
}


// ===============================
// ADD GEOJSON TO LEAFLET MAP
// ===============================
function addDataToMap(geojson) {
  markerCluster.clearLayers();

  geojson.features.forEach((feature) => {
    let lat = null;
    let lng = null;

    // --------------------------------------
    // PRIORITY #1 — Use GeoJSON geometry
    // --------------------------------------
    if (
      feature.geometry &&
      feature.geometry.type === "Point" &&
      feature.geometry.coordinates
    ) {
      lng = feature.geometry.coordinates[0];
      lat = feature.geometry.coordinates[1];
    }

    // --------------------------------------
    // PRIORITY #2 — If CARTO uses `geom`
    // Uncomment this block if needed
    /*
    if (!lat && feature.properties.geom) {
      // CARTO returns GEOGRAPHY as "POINT(lon lat)"
      const match = feature.properties.geom.match(/POINT\\(([^ ]+) ([^)]+)\\)/);
      if (match) {
        lng = parseFloat(match[1]);
        lat = parseFloat(match[2]);
      }
    }
    */

    // --------------------------------------
    // PRIORITY #3 — If only latitude/longitude
    // --------------------------------------
    if (!lat && feature.properties.latitude && feature.properties.longitude) {
      lat = feature.properties.latitude;
      lng = feature.properties.longitude;
    }

    if (!lat || !lng) return; // skip invalid points

    let popupHtml = `
      <b>${feature.properties.name_of_pharmacy || "Unnamed Pharmacy"}</b><br>
      <small>${feature.properties.address || "No address"}</small><br>
      <b>State:</b> ${feature.properties.state}<br>
      <b>LGA:</b> ${feature.properties.lga}<br>
      <b>Status:</b> ${feature.properties.status || "Unknown"}<br>
      <b>Verification:</b> ${feature.properties.verify || "Unknown"}
    `;
    let icon = unverifiedIcon;

    if (
      feature.properties.verify &&
      feature.properties.verify.toLowerCase() === "verified"
    ) {
      icon = verifiedIcon;
    }
    let marker = L.marker([lat, lng]).bindPopup(popupHtml);
    markerCluster.addLayer(marker);
  });

  document.getElementById("projectCount").innerText =
    geojson.features.length;
}


// ===============================
// UI HANDLERS
// ===============================
function triggerUiUpdate() {
  const sql = buildQuery();
  getData(sql);
}

function facilityName() {
  triggerUiUpdate();
}

// Loader icons
function showLoader() {
  document.getElementById("spinposition").style.display = "block";
}

function hideLoader() {
  document.getElementById("spinposition").style.display = "none";
}


// ===============================
// INITIAL LOAD
// ===============================
window.onload = function () {
  const sql = buildQuery();
  getData(sql);
};
