// --- Auto-Inject Favicon into Header ---
(function() {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    // Adjust path based on where this script runs. 
    // If diagnostic.js is in a subfolder, use '../favicon.png'
    link.href = '../favicon.png'; 
})();

/* =========================================
   GLOBAL VARIABLES & CONFIG
   ========================================= */
let auth, db;
let opioidTypes = [];
let toPoMorphineRatios = {};
let fromPoMorphineRatios = {};
let includedKeys = new Set();
let prnClickCount = 0;
let lastTotalPoMorphine = 0;

const ROUTES = ["IV", "SC", "SC/IV", "TD", "PO", "SL", "NAS"];

const defaultOpioidTypes = [
  { key: "po_morphine", label: "Morphine", unit: "mg" },
  { key: "sciv_morphine", label: "Morphine", unit: "mg" },
  { key: "po_oxycodone", label: "Oxycodone", unit: "mg" },
  { key: "sciv_oxycodone", label: "Oxycodone", unit: "mg" },
  { key: "po_tramadol", label: "Tramadol (max 400mg/day)", unit: "mg" },
  { key: "iv_tramadol", label: "Tramadol", unit: "mg" },
  { key: "po_codeine", label: "Codeine", unit: "mg" },
  { key: "po_dihydrocodeine", label: "Dihydrocodeine", unit: "mg" },
  { key: "td_fentanyl_patch", label: "Fentanyl Patch", unit: "mcg/hr" },
  { key: "sciv_fentanyl", label: "Fentanyl", unit: "mcg" }
];

const defaultToPoMorphineRatios = {
  po_morphine: 1,
  po_oxycodone: 1.5,
  po_tramadol: 0.2,
  po_codeine: 0.1,
  po_dihydrocodeine: 0.1,
  iv_tramadol: 0.2,
  td_fentanyl_patch: 2.4,
  sciv_morphine: 2,
  sciv_oxycodone: 3,
  sciv_fentanyl: 0.1
};

const defaultFromPoMorphineRatios = {
  po_morphine: 1,
  po_oxycodone: 2 / 3,
  po_tramadol: 5,
  po_codeine: 10,
  po_dihydrocodeine: 10,
  iv_tramadol: 5,
  td_fentanyl_patch: 1 / 2.4,
  sciv_morphine: 0.5,
  sciv_oxycodone: 1 / 3,
  sciv_fentanyl: 10
};

// 🔥 PRODUCTION FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
  authDomain: "pallicalc-eabdc.firebaseapp.com",
  projectId: "pallicalc-eabdc",
  storageBucket: "pallicalc-eabdc.firebasestorage.app",
  messagingSenderId: "347532270864",
  appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995",
  measurementId: "G-6G9C984F8E"
};

/* =========================================
   INITIALIZATION
   ========================================= */
function init() {
  console.log("Initializing Opioid Calc...");
  try {
    document.getElementById("calcPage").style.display = "block";
    document.getElementById("editPage").style.display = "none";
    document.body.style.overflow = "auto";
    
    initFirebaseAuth();
    setupEventListeners();
    setupLiveSafetyChecks();
  } catch (error) {
    console.error("Initialization Error:", error);
    alert("Error loading calculator logic: " + error.message);
  }
}

async function initFirebaseAuth() {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();

  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      console.warn("Offline persistence error:", err.code);
  });

  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "../index.html"; return; }
    
    // 🛑 EMAIL VERIFICATION CHECK
    if (!user.emailVerified) {
      alert("Please verify your email before using PalliCalc.");
      await auth.signOut();
      window.location.href = "../index.html";
      return;
    }

    // 🛑 ROLE CHECK
    try {
      const snap = await db.collection("users").doc(user.uid).get();
      if (!snap.exists) {
        await auth.signOut();
        window.location.href = "../index.html";
        return;
      }

      const profile = snap.data();
      
      // Redirect Admins to Dashboard
      if (profile.role === "institutionAdmin") { 
          window.location.href = "../Admin.html"; 
          return; 
      }

      window.PALLICALC_USER = { 
          role: profile.role, 
          institutionId: profile.institutionId || null,
          billingStatus: profile.billingStatus
      };
      
      await applyMemberRules();

    } catch(e) {
      console.error("Auth Init Error", e);
    }
  });
}

async function applyMemberRules() {
  const role = window.PALLICALC_USER.role;
  const editLink = document.getElementById("toEditLink");
  if (editLink) editLink.style.display = "";

  if (role === "institutionUser") {
    // 🛑 INSTITUTION USER LOGIC
    // 1. Remove Personal Ratios (Cleanup)
    localStorage.removeItem("opioidTypes");
    localStorage.removeItem("opioidIncluded");

    // 2. Try to load Institution Ratios
    // We check if app.js already cached them in 'palliCalc_customRatios'
    const cachedRatios = localStorage.getItem('palliCalc_customRatios');
    
    if (cachedRatios) {
        // A. Load from Local Cache (Synced by app.js)
        console.log("Loading Cached Institution Ratios...");
        const data = JSON.parse(cachedRatios);
        applyInstitutionData(data);
    } else {
        // B. If no cache (e.g. fresh reload or suspended), try Fetching
        // This will FAIL if suspended due to Security Rules
        await loadRatiosFromFirebase();
    }
  } else {
    // ✅ PERSONAL USER LOGIC
    loadSavedRatios();
    fillAllSelects(); 
  }

  // Institutional Lock Logic (Prevent editing)
  if (role === "institutionUser") {
    const originalNavigateToEdit = window.navigateToEdit;
    window.navigateToEdit = function () {
      originalNavigateToEdit();
      setTimeout(lockEditPageForInstitutionUser, 0);
    };
  }
}

// Helper to apply data to variables
function applyInstitutionData(data) {
    if (data.opioidTypes) {
        opioidTypes = data.opioidTypes;
        if (data.toPoMorphineRatios) {
            toPoMorphineRatios = data.toPoMorphineRatios;
            fromPoMorphineRatios = data.fromPoMorphineRatios;
        } else {
            toPoMorphineRatios = {};
            fromPoMorphineRatios = {};
            opioidTypes.forEach(op => {
                toPoMorphineRatios[op.key] = op.ratio;
                fromPoMorphineRatios[op.key] = 1 / op.ratio;
            });
        }
        includedKeys = new Set(data.includedKeys || []);
        fillAllSelects();
        
        const instName = localStorage.getItem('palliCalc_institutionName') || "Institution";
        updateBanner("institution", true, data.updatedAt, instName);
    } else {
        loadHardcodedDefaults();
        updateBanner("institution", false);
    }
}

function updateBanner(userType, isCustom, timestamp = null, instName = null) {
  const banner = document.getElementById("ratioBanner");
  let html = "";
  let dateStr = "";

  if (timestamp) {
    const dateObj = (timestamp && typeof timestamp.toDate === 'function') ? timestamp.toDate() : new Date(timestamp);
    if (!isNaN(dateObj)) {
       dateStr = ` (Saved: ${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`;
    }
  }

  if (userType === "personal") {
    html = isCustom 
      ? `<strong>Personal User:</strong> <span style="color: #198754; font-weight: bold;">Custom Ratios</span>${dateStr}` 
      : `<strong>Personal User:</strong> <span class="ratio-source-default">System Default Ratios</span>`;
  } else if (userType === "institution") {
    // 🛑 SUSPENSION VISUAL CHECK
    if (instName === "Suspended") {
        html = `<strong>Access Restricted:</strong> <span style="color: #dc3545; font-weight: bold;">System Default Ratios</span> (Contact Admin)`;
    } else {
        html = isCustom 
        ? `<strong>${instName || "Institution"}:</strong> <span style="color: #198754; font-weight: bold;">Custom Ratios</span>${dateStr}` 
        : `<strong>${instName || "Institution"}:</strong> <span class="ratio-source-default">Default Ratios (Admin has not configured custom values)</span>`;
    }
  }
  
  banner.innerHTML = html;
  banner.style.display = "block";
}

/* =========================================
   DATA HANDLING (UPDATED FOR SECURITY)
   ========================================= */
async function loadRatiosFromFirebase() {
    try {
      const instId = window.PALLICALC_USER.institutionId;
      if (!instId) { loadHardcodedDefaults(); updateBanner("institution", false); return; }

      // 🛑 SECURITY CHECK:
      // If Institution is SUSPENDED, this .get() will fail due to Firestore Rules.
      const ref = await db.collection("opioidRatios").doc(instId).get();

      if (ref.exists) {
        const data = ref.data();
        applyInstitutionData(data);
      } else {
        // No custom data exists yet
        loadHardcodedDefaults();
        updateBanner("institution", false);
      }
    } catch (e) {
      console.warn("Ratio Fetch Error (Likely Suspended):", e);
      // 🛑 FALLBACK TO DEFAULTS
      loadHardcodedDefaults();
      
      // If permission denied (suspended), show alert in banner
      if (e.code === 'permission-denied') {
          updateBanner("institution", false, null, "Suspended");
      } else {
          updateBanner("institution", false);
      }
    }
}

function loadHardcodedDefaults() {
  opioidTypes = defaultOpioidTypes.map(op => {
    const [route, name] = splitOpioidKey(op.key);
    return { ...op, label: name, route: route };
  });
  toPoMorphineRatios = { ...defaultToPoMorphineRatios };
  fromPoMorphineRatios = { ...defaultFromPoMorphineRatios };
  includedKeys = new Set(opioidTypes.map(o => o.key));
  fillAllSelects();
}

function loadSavedRatios() {
  let savedTypes = localStorage.getItem("opioidTypes");
  let savedIncluded = localStorage.getItem("opioidIncluded");
  let savedTime = localStorage.getItem("opioidSavedTime");

  if (savedTypes) {
    opioidTypes = JSON.parse(savedTypes);
    toPoMorphineRatios = {};
    fromPoMorphineRatios = {};
    includedKeys = new Set();

    opioidTypes.forEach(op => {
      toPoMorphineRatios[op.key] = op.ratio;
      fromPoMorphineRatios[op.key] = 1 / op.ratio;
      includedKeys.add(op.key);
    });

    if (savedIncluded) {
      try {
        const incl = JSON.parse(savedIncluded);
        if (Array.isArray(incl) && incl.length > 0) {
          includedKeys = new Set(incl);
        }
      } catch {}
    }
    updateBanner("personal", true, savedTime);
  } else {
    loadHardcodedDefaults();
    updateBanner("personal", false);
  }
}

/* =========================================
   HELPER FUNCTIONS (Standard)
   ========================================= */
function prettifyKey(key) {
  return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function splitOpioidKey(key) {
  const idx = key.indexOf("_");
  if (idx > 0) {
    let routeRaw = key.slice(0, idx).toLowerCase();
    if (["sciv", "sc_iv", "ivsc"].includes(routeRaw)) routeRaw = "sc/iv";
    let route = routeRaw.toUpperCase();
    if (route === "SCIV") route = "SC/IV";
    let namePart = key.slice(idx + 1);
    let name = prettifyKey(namePart);
    return [route, name];
  }
  return [key.slice(0, 2).toUpperCase(), prettifyKey(key.slice(2))];
}

function findKey(route, name) {
  route = route.toUpperCase();
  let found = opioidTypes.find(op => op.route === route && op.label === name);
  if (!found && (route === "SC" || route === "IV")) {
    found = opioidTypes.find(op => op.route === "SC/IV" && op.label === name);
  }
  return found ? found.key : "";
}

function formatUnit(type) {
  const found = opioidTypes.find(op => op.key === type);
  if (found) return found.unit;
  switch (type) {
    case "fentanyl_patch": return "mcg/hr (TD fentanyl patch)";
    case "sc_fentanyl": return "mcg (SC fentanyl)";
    default: return "mg";
  }
}

function getDoseValue(id) {
  const val = parseFloat(document.getElementById(id).value);
  return isNaN(val) || val < 0 ? 0 : val;
}

/* =========================================
   UI & NAVIGATION
   ========================================= */
window.navigateToEdit = function() {
  document.getElementById("calcPage").style.display = "none";
  document.getElementById("editPage").style.display = "block";
  document.getElementById("toEditLink").style.display = "none";
  document.getElementById("toCalcLink").style.display = "";
  document.getElementById("msgArea").style.display = "none";
  document.getElementById("errorArea").style.display = "none";
  document.getElementById("passInput").value = "";
  generateEditTable();
  document.getElementById("clearBtn").style.display = "none";
};

window.navigateToCalc = function() {
  document.getElementById("editPage").style.display = "none";
  document.getElementById("calcPage").style.display = "block";
  document.getElementById("toEditLink").style.display = "";
  document.getElementById("toCalcLink").style.display = "none";
  fillAllSelects();
  document.getElementById("clearBtn").style.display = "block";
};

window.togglePrn = function() {
  prnClickCount = (prnClickCount + 1) % 4;
  const prn1 = document.getElementById("prnOpioid1");
  const prn2 = document.getElementById("prnOpioid2");
  const prn3 = document.getElementById("prnOpioid3");
  const btn = document.getElementById("showPrnBtn");
  
  if (prnClickCount === 0) {
    prn1.style.display = "none"; prn2.style.display = "none"; prn3.style.display = "none";
    btn.textContent = "Add Additional/PRN Opioid 1";
  } else if (prnClickCount === 1) {
    prn1.style.display = "block"; prn2.style.display = "none"; prn3.style.display = "none";
    btn.textContent = "Add Additional/PRN Opioid 2";
  } else if (prnClickCount === 2) {
    prn1.style.display = "block"; prn2.style.display = "block"; prn3.style.display = "none";
    btn.textContent = "Add Additional/PRN Opioid 3";
  } else if (prnClickCount === 3) {
    prn1.style.display = "block"; prn2.style.display = "block"; prn3.style.display = "block";
    btn.textContent = "Hide Additional/PRN Opioids";
  }
};

function lockEditPageForInstitutionUser() {
  document.getElementById("saveBtn")?.remove();
  document.getElementById("passInput")?.remove();
  document.getElementById("resetBtn")?.remove();
  document.querySelector('label[for="passInput"]')?.remove();

  if (document.getElementById("inst-lock-msg")) return;

  const info = document.createElement("div");
  info.id = "inst-lock-msg";
  info.className = "alert-box";
  info.innerHTML = "Institutional users cannot modify conversion data.";
  document.getElementById("editPage").prepend(info);
}

/* =========================================
   POPULATE DROPDOWNS
   ========================================= */
function fillAllSelects() {
  const inputRoutes = ["inputRoute1", "inputRoute2", "inputRoute3", "inputRoute4"];
  const inputNames = ["inputName1", "inputName2", "inputName3", "inputName4"];
  const outputRoutes = ["outputRoute"];
  const outputNames = ["outputName"];
  const prnRoutes = ["prnRouteSelect"];
  const prnNames = ["prnNameSelect"];

  function filteredRoutes() {
    const routesSet = new Set();
    opioidTypes.forEach(op => {
      if (includedKeys.has(op.key) && ROUTES.includes(op.route) && op.route !== "SC/IV") {
        routesSet.add(op.route);
      }
      if (includedKeys.has(op.key) && op.route === "SC/IV") {
        routesSet.add("SC");
        routesSet.add("IV");
      }
    });
    return Array.from(routesSet).sort((a, b) => ROUTES.indexOf(a) - ROUTES.indexOf(b));
  }

  function filteredPrnRoutes() {
    const routesSet = new Set();
    opioidTypes.forEach(op => {
      if (includedKeys.has(op.key) && ROUTES.includes(op.route) && op.route !== "SC/IV" && op.route !== "TD") {
        routesSet.add(op.route);
      }
      if (includedKeys.has(op.key) && op.route === "SC/IV") {
        routesSet.add("SC");
        routesSet.add("IV");
      }
    });
    return Array.from(routesSet).sort((a, b) => ROUTES.indexOf(a) - ROUTES.indexOf(b));
  }

  function namesForRoute(route) {
    return opioidTypes
      .filter(op => includedKeys.has(op.key) && (op.route === route || (op.route === "SC/IV" && (route === "SC" || route === "IV"))))
      .map(op => op.label)
      .sort();
  }

  function fillRouteSelects(ids) {
    ids.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = "";
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "1. Select route";
      sel.appendChild(emptyOption);
      if (id === "prnRouteSelect") {
        filteredPrnRoutes().forEach(r => {
          const option = document.createElement("option");
          option.value = r; option.textContent = r; sel.appendChild(option);
        });
      } else {
        filteredRoutes().forEach(r => {
          const option = document.createElement("option");
          option.value = r; option.textContent = r; sel.appendChild(option);
        });
      }
      sel.selectedIndex = 0;
    });
  }

  function fillNameSelects(routeSelectId, nameSelectId, unitSpanId) {
    const routeSel = document.getElementById(routeSelectId);
    const nameSel = document.getElementById(nameSelectId);
    const unitSpan = unitSpanId ? document.getElementById(unitSpanId) : null;
    if (!routeSel || !nameSel) return;
    const selectedRoute = routeSel.value;
    nameSel.innerHTML = "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "2. Select opioid";
    nameSel.appendChild(emptyOption);
    if (!selectedRoute) { if (unitSpan) unitSpan.textContent = ""; return; }
    namesForRoute(selectedRoute).forEach(name => {
      const option = document.createElement("option");
      option.value = name; option.textContent = name; nameSel.appendChild(option);
    });
    nameSel.selectedIndex = 0;
    if (unitSpan) unitSpan.textContent = "";
  }

  function updateUnit(routeSelId, nameSelId, unitSpanId) {
    const route = document.getElementById(routeSelId).value;
    const name = document.getElementById(nameSelId).value;
    const unitSpan = document.getElementById(unitSpanId);
    if (!route || !name) { if (unitSpan) unitSpan.textContent = ""; return; }
    const key = findKey(route, name);
    if (unitSpan) unitSpan.textContent = formatUnit(key);
  }
  
  inputRoutes.forEach((routeId, idx) => {
    const routeEl = document.getElementById(routeId);
    const nameEl = document.getElementById(inputNames[idx]);
    
    // Clear old listeners by cloning
    const newRouteEl = routeEl.cloneNode(true);
    routeEl.parentNode.replaceChild(newRouteEl, routeEl);
    
    const newNameEl = nameEl.cloneNode(true);
    nameEl.parentNode.replaceChild(newNameEl, nameEl);
    
    newRouteEl.addEventListener("change", () => {
      fillNameSelects(routeId, inputNames[idx], `inputUnit${idx + 1}`);
      updateUnit(routeId, inputNames[idx], `inputUnit${idx + 1}`);
    });
    newNameEl.addEventListener("change", () => {
      updateUnit(routeId, inputNames[idx], `inputUnit${idx + 1}`);
    });
  });

  const outRouteEl = document.getElementById("outputRoute");
  const newOutRouteEl = outRouteEl.cloneNode(true);
  outRouteEl.parentNode.replaceChild(newOutRouteEl, outRouteEl);
  newOutRouteEl.addEventListener("change", () => fillNameSelects("outputRoute", "outputName"));

  fillRouteSelects(inputRoutes.concat(outputRoutes, prnRoutes));
}

// Global lookup functions
window.getKeyByInput = function (inputIdx) {
  const route = document.getElementById(`inputRoute${inputIdx}`).value;
  const name = document.getElementById(`inputName${inputIdx}`).value;
  return findKey(route, name);
};
window.getKeyByOutput = function () {
  const route = document.getElementById("outputRoute").value;
  const name = document.getElementById("outputName").value;
  return findKey(route, name);
};
window.getKeyByPrn = function () {
  const route = document.getElementById("prnRouteSelect").value;
  const name = document.getElementById("prnNameSelect").value;
  return findKey(route, name);
};

/* =========================================
   CALCULATION LOGIC
   ========================================= */
window.convert = function() {
  const doses = [getDoseValue("inputDose1"), getDoseValue("inputDose2"), getDoseValue("inputDose3"), getDoseValue("inputDose4")];
  const types = [window.getKeyByInput(1), window.getKeyByInput(2), window.getKeyByInput(3), window.getKeyByInput(4)];
  const outputType = window.getKeyByOutput();

  if (doses.some(d => d < 0)) { alert("Please enter valid non-negative doses."); return; }
  if (doses.every(d => d === 0)) { alert("Please enter at least one positive opioid dose."); return; }

  // --- TRACKING ---
  if (typeof window.trackEvent === 'function') {
      let drugName = 'Unknown';
      if (types[0]) {
         const opObj = opioidTypes.find(op => op.key === types[0]);
         if(opObj) drugName = opObj.label;
      }
      
      window.trackEvent('clinical_calculation', {
          'event_category': 'Opioid Calculator',
          'event_label': drugName,
          'institution_id': (typeof window.PALLICALC_USER !== 'undefined' && window.PALLICALC_USER.institutionId) ? window.PALLICALC_USER.institutionId : 'personal_user'
      });
  }
  // ----------------

  let totalPoMorphine = 0;
  for (let i = 0; i < 4; i++) {
    if (!types[i]) continue;
    const ratio = toPoMorphineRatios[types[i]];
    if (ratio === undefined) { alert(`Calculation error: ratio for "${types[i]}" not found.`); return; }
    totalPoMorphine += doses[i] * ratio;
  }
  lastTotalPoMorphine = totalPoMorphine;

  const outputDoseNoAdjustment = totalPoMorphine * fromPoMorphineRatios[outputType];
  const primaryPoMorphineDose = doses[0] * toPoMorphineRatios[types[0]];
  
  let alertMessage = "";
  if (primaryPoMorphineDose > 0) {
    const percentIncrease = ((totalPoMorphine - primaryPoMorphineDose) / primaryPoMorphineDose) * 100;
    if (percentIncrease >= 30) {
      alertMessage = `<div class="alert-box">Alert: Dose increase ${percentIncrease.toFixed(0)}% compared to primary opioid dose</div>`;
    }
  }

  const outputRouteDisplay = document.getElementById("outputRoute").value;
  const outputNameDisplay = document.getElementById("outputName").value;

  let message = alertMessage +
    `<div class="equivalent-dose">Total Daily Equivalent dose (without cross-tolerance adjustment) [${outputRouteDisplay} ${outputNameDisplay}]: ${outputDoseNoAdjustment.toFixed(0)} ${formatUnit(outputType)}/day <a href="../guides/opioid-conversion.html" class="info-icon" data-tooltip="Opioid Conversion Calculation"><i class="bi bi-info-circle"></i></a></div>`;

  if (outputRouteDisplay === "TD") {
    message += `<div class="note-title" style="color: #d9534f; font-size: 13px; margin-top: 8px; font-weight: normal;">⚠️ Convert to TD patch (e.g., Fentanyl Patch) only after stable opioid dosing is established.</div>`;
  }

  message += `<div class="total-morphine">Total PO morphine equivalent dose: ${totalPoMorphine.toFixed(0)} mg</div>`;

  const outputOpioidKey = outputType.toLowerCase();
  if (outputOpioidKey.includes("tramadol")) {
    message += `<div class="note-title" style="color: orange;">⚠️ Tramadol Max: 400mg/day; reduces seizure threshold.</div>`;
  } else if (outputOpioidKey.includes("dihydrocodeine")) {
    message += `<div class="note-title" style="color: orange;">⚠️ Dihydrocodeine Max: 240mg/day.</div>`;
  } else if (outputOpioidKey.includes("codeine")) {
    message += `<div class="note-title" style="color: orange;">⚠️ Codeine Max: 240mg/day.</div>`;
  }

  const inputRoutes = [
    document.getElementById("inputRoute1")?.value.toUpperCase() || "",
    document.getElementById("inputRoute2")?.value.toUpperCase() || "",
    document.getElementById("inputRoute3")?.value.toUpperCase() || ""
  ];
  const hasPoInput = inputRoutes.some(route => route === "PO");
  if (hasPoInput && outputRouteDisplay.toUpperCase() !== "PO") {
    message += `<div class="note">Note: do not include PRN oral doses in the total daily dose calculation if the patient has severe constipation or impaired oral absorption.</div>`;
  }

  const primaryInputType = types[0];
  const isFentanylSwitch = (primaryInputType === "td_fentanyl_patch" && outputType === "sciv_fentanyl") || (primaryInputType === "sciv_fentanyl" && outputType === "td_fentanyl_patch");
  const primaryInputName = opioidTypes.find(op => op.key === primaryInputType)?.label || "";
  const outputName = opioidTypes.find(op => op.key === outputType)?.label || "";

  if (primaryInputName !== outputName && totalPoMorphine > 100 && !isFentanylSwitch) {
    const reducedDose25 = outputDoseNoAdjustment * 0.75;
    const reducedDose50 = outputDoseNoAdjustment * 0.5;
    message += `<div class="note-title" style="color: red;">⚠️ CAUTION: INCOMPLETE CROSS-TOLERANCE</div>` +
      `Switching from one high-dose opioid to another, consider DOSE REDUCTION of 25%-50%.` +
      `<table><thead><tr><th>Reduction</th><th>Dose</th><th>Unit</th></tr></thead>` +
      `<tbody><tr><td>25% Reduced Dose</td><td>${reducedDose25.toFixed(0)}</td><td>${formatUnit(outputType)}</td></tr>` +
      `<tr><td>50% Reduced Dose</td><td>${reducedDose50.toFixed(0)}</td><td>${formatUnit(outputType)}</td></tr></tbody></table>` +
      `<div style="margin-top:8px;">Monitor patient response closely.</div>`;
  }

  const resultDiv = document.getElementById("resultBox");
  // Ensure we are targeting the inner content div if it exists, to preserve the tracking wrapper
  const trackingContent = document.getElementById("tracking-result-content");
  
  if (trackingContent) {
      trackingContent.innerHTML = message;
      resultDiv.style.display = 'block';
  } else {
      // Fallback for old structure
      resultDiv.innerHTML = message;
      resultDiv.style.display = 'block';
  }

  resultDiv.scrollIntoView({ behavior: "smooth", block: "center" });

  document.getElementById("prnCalculation").style.display = "block";
  document.getElementById("prnRouteSelect").value = "";
  document.getElementById("prnDoseOutput").style.display = "none";
};

window.calculateNewPrnDose = function() {
  const outputDiv = document.getElementById("prnDoseOutput");
  const selectedRoute = document.getElementById("prnRouteSelect").value;
  const selectedName = document.getElementById("prnNameSelect").value;

  if (!selectedRoute || !selectedName) { outputDiv.style.display = "none"; return; }

  const prnOp = opioidTypes.find(op => op.label === selectedName && (op.route === selectedRoute || ((selectedRoute === "SC" || selectedRoute === "IV") && op.route === "SC/IV")));
  const prnKey = prnOp ? prnOp.key : "";
  if (!prnKey || lastTotalPoMorphine === 0) { outputDiv.style.display = "none"; return; }

  const prnMin = lastTotalPoMorphine / 12;
  const prnMax = lastTotalPoMorphine / 6;
  const prnMinConverted = prnMin * fromPoMorphineRatios[prnKey];
  const prnMaxConverted = prnMax * fromPoMorphineRatios[prnKey];
  const unit = formatUnit(prnKey);

  outputDiv.innerHTML = `New PRN Dose Range (${selectedRoute} ${selectedName}): ${prnMinConverted.toFixed(0)} - ${prnMaxConverted.toFixed(0)} ${unit}
  <a href="../guides/prn-calculation.html" class="prn-icon info-icon" data-tooltip="PRN dose calculation"><i class="bi bi-exclamation-circle"></i></a>`;
  outputDiv.style.display = "block";
  outputDiv.scrollIntoView({ behavior: "smooth", block: "center" });
};

window.clearCalculator = function() {
  document.querySelectorAll('input[type="number"]').forEach(input => (input.value = ""));
  document.querySelectorAll("select").forEach(select => (select.selectedIndex = 0));
  fillAllSelects();
  document.querySelectorAll('[id^="inputUnit"]').forEach(span => (span.textContent = ""));
  
  document.getElementById("prnOpioid1").style.display = "none";
  document.getElementById("prnOpioid2").style.display = "none";
  document.getElementById("prnOpioid3").style.display = "none";
  document.getElementById("showPrnBtn").textContent = "Add Additional/PRN Opioid 1";
  prnClickCount = 0;

  document.getElementById("resultBox").style.display = "none";
  document.getElementById("prnDoseOutput").style.display = "none";
  
  for (let i = 1; i <= 4; i++) {
    const warn = document.getElementById(`warningMsg${i}`);
    if(warn) warn.style.display = 'none';
  }
  lastTotalPoMorphine = 0;
};

/* =========================================
   EDIT & SAVE LOGIC (Restricted for Institution)
   ========================================= */
window.generateEditTable = function() {
  const tbody = document.getElementById("ratioTableBody");
  tbody.innerHTML = "";
  
  opioidTypes.forEach(op => {
    const checkedAttr = includedKeys.has(op.key) ? "checked" : "";
    let tr = document.createElement("tr");
    const routeOptions = ROUTES.map(r => `<option value="${r}"${r === op.route ? " selected" : ""}>${r}</option>`).join('');
    
    tr.innerHTML = `
      <td class="select-col"><input type="checkbox" id="select_${op.key}" data-key="${op.key}" ${checkedAttr}></td>
      <td class="route-col"><select id="editRoute_${op.key}" class="route-select">${routeOptions}</select></td>
      <td class="opioid-name-col"><input type="text" id="editName_${op.key}" value="${op.label}" required></td>
      <td class="ratio-col"><input type="number" min="0.001" step="0.0001" value="${toPoMorphineRatios[op.key]}" id="editRatio_${op.key}" required></td>
      <td class="unit-col"><input type="text" value="${op.unit}" id="editUnit_${op.key}"></td>
    `;
    tbody.appendChild(tr);
  });

  for (let i = 1; i <= 6; i++) {
    const routeOptionsNew = ROUTES.map(r => `<option value="${r}">${r}</option>`).join('');
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="select-col"><input type="checkbox" id="select_new_${i}" data-key="new_${i}"></td>
      <td class="route-col"><select id="newRoute_${i}" class="new-route-select"><option value="">Route</option>${routeOptionsNew}</select></td>
      <td class="opioid-name-col"><input type="text" placeholder="Opioid ${i}" id="newName_${i}"></td>
      <td class="ratio-col"><input type="number" min="0.001" step="0.0001" placeholder="Ratio" id="newRatio_${i}"></td>
      <td class="unit-col"><input type="text" placeholder="Unit" id="newUnit_${i}"></td>
    `;
    tbody.appendChild(tr);
  }
};

window.saveRatios = function() {
  const userRole = window.PALLICALC_USER ? window.PALLICALC_USER.role : "personal";
  if (userRole !== 'personal') { alert("⛔ Access Denied: Institutional changes must be made via the Admin Dashboard."); return false; }

  const pwd = document.getElementById("passInput").value;
  const savedPwd = localStorage.getItem("palliCalcLoginPassword") || "";
  const msgArea = document.getElementById("msgArea");
  const errorArea = document.getElementById("errorArea");
  msgArea.style.display = "none"; errorArea.style.display = "none";

  if (!savedPwd) { errorArea.textContent = "Please login on homepage first to set password."; errorArea.style.display = "inline"; return false; }
  if (pwd !== savedPwd) { errorArea.textContent = "Password does not match your homepage login."; errorArea.style.display = "inline"; return false; }

  let opioidTypesToSave = [];
  includedKeys.clear();

  const tbody = document.getElementById("ratioTableBody");
  const rows = tbody.querySelectorAll("tr");

  for (let row of rows) {
    const selectCheckbox = row.querySelector('input[type="checkbox"]');
    const routeSelect = row.querySelector('select.route-select') || row.querySelector('select.new-route-select');
    const nameInput = row.querySelector('td.opioid-name-col input[type="text"]');
    const ratioInput = row.querySelector('input[type="number"]');
    const unitInput = row.querySelector('td:last-child input[type="text"]');

    if (!selectCheckbox || !routeSelect || !nameInput || !ratioInput || !unitInput) continue;
    if (!selectCheckbox.checked) continue;

    let route = routeSelect.value.trim().toUpperCase();
    let name = nameInput.value.trim();
    let ratio = parseFloat(ratioInput.value);
    let unit = unitInput.value.trim();

    if (!ROUTES.includes(route)) { alert(`Invalid route "${route}" selected.`); return false; }

    const sanitizedName = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const sanitizedRoute = route.toLowerCase();
    let key = sanitizedRoute + "_" + sanitizedName;
    let baseKey = key;
    let suffix = 1;
    while (opioidTypesToSave.some(op => op.key === key)) { key = baseKey + "_" + suffix++; }

    opioidTypesToSave.push({ key: key, label: name, route: route, ratio: ratio, unit: unit });
    includedKeys.add(key);
  }

  toPoMorphineRatios = {}; fromPoMorphineRatios = {};
  opioidTypesToSave.forEach(op => { toPoMorphineRatios[op.key] = op.ratio; fromPoMorphineRatios[op.key] = 1 / op.ratio; });
  opioidTypes = opioidTypesToSave;

  localStorage.setItem("opioidTypes", JSON.stringify(opioidTypesToSave));
  localStorage.setItem("opioidIncluded", JSON.stringify(Array.from(includedKeys)));
  const now = new Date().toISOString();
  localStorage.setItem("opioidSavedTime", now);

  updateBanner("personal", true, now);
  msgArea.textContent = "Ratios saved successfully in local storage!";
  msgArea.style.display = "inline";
  document.getElementById("passInput").value = "";

  setTimeout(() => { msgArea.style.display = "none"; }, 2000);
  fillAllSelects();
  return false;
};

window.resetToDefaults = function() {
  if (!confirm("Are you sure you want to reset conversion ratios to default?")) return;
  loadHardcodedDefaults();
  localStorage.removeItem("opioidTypes");
  localStorage.removeItem("opioidIncluded");
  generateEditTable();
  alert("Conversion ratios reset to defaults.");
};

/* =========================================
   SAFETY CHECKS (Unit-Specific)
   ========================================= */
function setupLiveSafetyChecks() {
  ["inputDose1", "inputDose2", "inputDose3", "inputDose4"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", runPassiveSafetyCheck);
  });
  document.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", runPassiveSafetyCheck);
  });
}

function runPassiveSafetyCheck() {
  for (let i = 1; i <= 4; i++) {
    const doseEl = document.getElementById(`inputDose${i}`);
    const warningEl = document.getElementById(`warningMsg${i}`);
    if (!doseEl || !warningEl) continue;
    
    const dose = parseFloat(doseEl.value);
    let showWarning = false;

    if (!isNaN(dose) && dose > 0) {
      let typeKey = "";
      if (typeof window.getKeyByInput === 'function') typeKey = window.getKeyByInput(i);

      if (typeKey) {
        const opObj = opioidTypes.find(op => op.key === typeKey);
        if (opObj && opObj.unit) {
          const unit = opObj.unit.toLowerCase();
          let limit = 0;
          if (unit === "mg") limit = 200;
          else if (unit === "mcg") limit = 2000;
          else if (unit.includes("mcg/hr")) limit = 100;

          if (limit > 0 && dose > limit) showWarning = true;
        }
      }
    }
    warningEl.style.display = showWarning ? 'block' : 'none';
  }
}

function setupEventListeners() {
  document.getElementById("prnRouteSelect").addEventListener("change", () => {
    const prnRoute = document.getElementById("prnRouteSelect").value;
    const prnNameSelect = document.getElementById("prnNameSelect");
    prnNameSelect.innerHTML = "";
    if (prnRoute) {
      const emptyOption = document.createElement("option");
      emptyOption.value = ""; emptyOption.textContent = "Select opioid";
      prnNameSelect.appendChild(emptyOption);
      opioidTypes
        .filter(op => {
          if (op.key === "fentanyl_patch") return false;
          if (prnRoute === "SC" || prnRoute === "IV") return includedKeys.has(op.key) && (op.route === prnRoute || op.route === "SC/IV");
          return includedKeys.has(op.key) && op.route === prnRoute;
        })
        .forEach(op => {
          const option = document.createElement("option");
          option.value = op.label; option.textContent = op.label;
          prnNameSelect.appendChild(option);
        });
      prnNameSelect.selectedIndex = 0;
      window.calculateNewPrnDose();
    } else {
      document.getElementById("prnDoseOutput").style.display = "none";
    }
  });
  document.getElementById("prnNameSelect").addEventListener("change", window.calculateNewPrnDose);
}

// ⚠️ START APP
document.addEventListener("DOMContentLoaded", init);
