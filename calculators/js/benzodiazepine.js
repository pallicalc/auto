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
let benzoTypes = [];
let includedKeys = new Set();
let extraCount = 0;

const ROUTES = ["PO", "IV", "SC", "SC/IV", "SL/Buccal", "IM"];

const defaultBenzoTypes = [
  { key: "alprazolam", label: "Alprazolam", route: "PO", equiv: 1, onset: "30 min", duration: "6-20 h" },
  { key: "lorazepam", label: "Lorazepam", route: "PO", equiv: 2, onset: "30-60 min", duration: "10-20 h" },
  { key: "bromazepam", label: "Bromazepam", route: "PO", equiv: 6, onset: "30m-4h", duration: "10-20 h" },
  { key: "midazolam_sc_iv", label: "Midazolam", route: "SC/IV", equiv: 4, onset: "1-3 min", duration: "2-4 h" },
  { key: "chlordiazepoxide", label: "Chlordiazepoxide", route: "PO", equiv: 50, onset: "1.5 h", duration: "5-30 h" },
  { key: "clonazepam", label: "Clonazepam", route: "PO", equiv: 1, onset: "1 h", duration: "18-39 h" },
  { key: "diazepam", label: "Diazepam", route: "PO", equiv: 15, onset: "30 min", duration: "20-50 h" }
];

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
  try {
    // Show calculator UI immediately to prevent flash/delay
    document.getElementById("calcPage").style.display = "block";
    document.getElementById("editPage").style.display = "none";
    
    initFirebaseAuth();
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
    
    window.PALLICALC_USER = { role: profile.role, institutionId: profile.institutionId || null };
    
    // Auth success - Load logic
    await applyMemberRules();
    document.getElementById("calcPage").style.display = "block";
  });
}

async function applyMemberRules() {
  const role = window.PALLICALC_USER.role;
  const editLink = document.getElementById("toEditLink");
  if (editLink) editLink.style.display = "";
  
  if (role === "institutionUser") {
    // 🛑 INSTITUTION USER LOGIC
    // 1. Remove Personal Ratios (Cleanup)
    localStorage.removeItem("benzoTypes");
    localStorage.removeItem("benzoIncluded");
    
    // 2. Fetch Ratios (Will fail if Suspended)
    await loadRatiosFromFirebase();
  } else {
    // ✅ PERSONAL USER LOGIC
     loadSavedData(); 
  }
  
  if (role === "institutionUser") {
    const originalNavigateToEdit = window.navigateToEdit;
    window.navigateToEdit = function () {
      originalNavigateToEdit();
      setTimeout(lockEditPageForInstitutionUser, 0);
    };
  }
}

function updateBanner(userType, isCustom, timestamp = null, instName = null) {
  const banner = document.getElementById("ratioBanner");
  let html = "";
  let dateStr = "";
  if (timestamp) {
    const dateObj = (timestamp && typeof timestamp.toDate === 'function') ? timestamp.toDate() : new Date(timestamp);
    if (!isNaN(dateObj)) dateStr = ` (Saved: ${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`;
  }

  if (userType === "personal") {
    html = isCustom 
        ? `<strong>Personal User:</strong> <span style="color:#198754; font-weight:bold;">Custom Ratios</span>${dateStr}` 
        : `<strong>Personal User:</strong> <span style="color:#6c757d; font-style:italic;">Default Ratios</span>`;
  } else if (userType === "institution") {
    // 🛑 SUSPENSION VISUAL CHECK
    if (instName === "Suspended") {
        html = `<strong>Access Restricted:</strong> <span style="color: #dc3545; font-weight: bold;">System Default Ratios</span> (Contact Admin)`;
    } else {
        html = isCustom 
            ? `<strong>${instName || "Institution"}:</strong> <span style="color:#198754; font-weight:bold;">Custom Ratios</span>${dateStr}` 
            : `<strong>${instName || "Institution"}:</strong> <span style="color:#6c757d; font-style:italic;">Default Ratios</span>`;
    }
  }
  banner.innerHTML = html;
  banner.style.display = "block";
}

/* =========================================
   DATA LOADING (UPDATED FOR SECURITY)
   ========================================= */
async function loadRatiosFromFirebase() {
    try {
      const instId = window.PALLICALC_USER.institutionId;
      if (!instId) { loadHardcodedDefaults(); updateBanner("institution", false); return; }
      
      // 🛑 SECURITY CHECK:
      // If Institution is SUSPENDED, this .get() will fail due to Firestore Rules.
      const ref = await db.collection("benzoRatios").doc(instId).get();
      
      if (ref.exists) {
        const data = ref.data();
        benzoTypes = data.benzoTypes || [];
        includedKeys = data.includedKeys ? new Set(data.includedKeys) : new Set(benzoTypes.map(b => b.key));
        fillAllSelects();
        updateBanner("institution", true, data.updatedAt);
      } else {
        // No custom data exists yet
        loadHardcodedDefaults();
        updateBanner("institution", false);
      }
    } catch (e) { 
      console.warn("Benzo Fetch Error (Likely Suspended):", e);
      // 🛑 FALLBACK TO DEFAULTS
      loadHardcodedDefaults(); 
      
      if (e.code === 'permission-denied') {
          // Explicitly show suspension state in banner
          updateBanner("institution", false, null, "Suspended");
      } else {
          updateBanner("institution", false);
      }
    }
}

function loadHardcodedDefaults() {
  benzoTypes = JSON.parse(JSON.stringify(defaultBenzoTypes));
  includedKeys = new Set(benzoTypes.map(b => b.key));
  fillAllSelects();
}

function loadSavedData() {
  let savedTypes = localStorage.getItem("benzoTypes");
  let savedIncluded = localStorage.getItem("benzoIncluded");
  let savedTime = localStorage.getItem("benzoSavedTime");
  if (savedTypes) {
    benzoTypes = JSON.parse(savedTypes);
    if (savedIncluded) { try { const incl = JSON.parse(savedIncluded); includedKeys = new Set(incl); } catch {} }
    updateBanner("personal", true, savedTime);
  } else {
    benzoTypes = JSON.parse(JSON.stringify(defaultBenzoTypes));
    includedKeys = new Set(benzoTypes.map(b => b.key));
    updateBanner("personal", false);
  }
}

/* =========================================
   BUG FIX: LOCK FUNCTION
   ========================================= */
function lockEditPageForInstitutionUser() {
  // 1. Remove inputs
  document.getElementById("saveBtn")?.remove();
  document.getElementById("passInput")?.remove();
  document.getElementById("resetBtn")?.remove();
  document.querySelector("label[for='passInput']")?.remove();

  // 2. STOP if message already exists (Fixes the duplication bug)
  if (document.getElementById("inst-lock-msg")) return;

  // 3. Create message (Uses external CSS style)
  const info = document.createElement("div");
  info.id = "inst-lock-msg"; 
  info.className = "alert-box"; 
  info.innerHTML = "Institutional users cannot modify conversion data.";
  
  document.getElementById("editPage").prepend(info);
}

/* =========================================
   NAVIGATION & UI
   ========================================= */
function navigateToEdit() {
  document.getElementById("calcPage").style.display = "none";
  document.getElementById("editPage").style.display = "block";
  document.getElementById("toEditLink").style.display = "none";
  document.getElementById("toCalcLink").style.display = "";
  document.getElementById("msgArea").style.display = "none"; 
  generateEditTable();
}

function navigateToCalc() {
  document.getElementById("editPage").style.display = "none";
  document.getElementById("calcPage").style.display = "block";
  document.getElementById("toEditLink").style.display = "";
  document.getElementById("toCalcLink").style.display = "none";
  fillAllSelects();
}

function toggleExtra() {
    extraCount = (extraCount + 1) % 4;
    document.getElementById("extraBenzo1").style.display = extraCount >= 1 ? 'block' : 'none';
    document.getElementById("extraBenzo2").style.display = extraCount >= 2 ? 'block' : 'none';
    document.getElementById("extraBenzo3").style.display = extraCount >= 3 ? 'block' : 'none';
    document.getElementById("showExtraBtn").textContent = extraCount === 3 ? "Hide Extra" : "Add Additional Benzodiazepine";
}

function fillAllSelects() {
  const inputRoutes = ["inputRoute1", "inputRoute2", "inputRoute3", "inputRoute4"];
  const inputNames = ["inputName1", "inputName2", "inputName3", "inputName4"];
  
  const routesSet = new Set();
  benzoTypes.filter(b => includedKeys.has(b.key)).forEach(b => {
      if (b.route === "SC/IV") {
          routesSet.add("SC");
          routesSet.add("IV");
      } else {
          routesSet.add(b.route);
      }
  });
  const availableRoutes = [...routesSet].filter(r => r !== "SC/IV").sort();

  const getDrugsForRoute = (route) => {
      return benzoTypes.filter(b => 
        includedKeys.has(b.key) && 
        (b.route === route || (b.route === "SC/IV" && (route === "SC" || route === "IV")))
      );
  };

  inputRoutes.forEach((rid, idx) => {
    const sel = document.getElementById(rid);
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Route</option>';
    availableRoutes.forEach(r => sel.innerHTML += `<option value="${r}">${r}</option>`);
    if(currentVal && availableRoutes.includes(currentVal)) sel.value = currentVal;

    sel.onchange = () => {
      const nSel = document.getElementById(inputNames[idx]);
      nSel.innerHTML = '<option value="">Drug</option>';
      const drugs = getDrugsForRoute(sel.value);
      drugs.forEach(b => nSel.innerHTML += `<option value="${b.key}">${b.label}</option>`);
    };
    
    if(sel.value) {
        const nSel = document.getElementById(inputNames[idx]);
        const currName = nSel.value;
        nSel.innerHTML = '<option value="">Drug</option>';
        const drugs = getDrugsForRoute(sel.value);
        drugs.forEach(b => nSel.innerHTML += `<option value="${b.key}">${b.label}</option>`);
        if(currName) nSel.value = currName;
    }
  });

  const oRoute = document.getElementById("outputRoute");
  const currentOR = oRoute.value;
  oRoute.innerHTML = '<option value="">Route</option>';
  availableRoutes.forEach(r => oRoute.innerHTML += `<option value="${r}">${r}</option>`);
  if(currentOR && availableRoutes.includes(currentOR)) oRoute.value = currentOR;

  oRoute.onchange = () => {
    const onSel = document.getElementById("outputName");
    onSel.innerHTML = '<option value="">Drug</option>';
    const drugs = getDrugsForRoute(oRoute.value);
    drugs.forEach(b => onSel.innerHTML += `<option value="${b.key}">${b.label}</option>`);
  };
  
  if(oRoute.value) {
    const onSel = document.getElementById("outputName");
    const currName = onSel.value;
    onSel.innerHTML = '<option value="">Drug</option>';
    const drugs = getDrugsForRoute(oRoute.value);
    drugs.forEach(b => onSel.innerHTML += `<option value="${b.key}">${b.label}</option>`);
    if(currName) onSel.value = currName;
  }
}

/* =========================================
   CALCULATION & LOGIC
   ========================================= */
function convert() {
    const targetKey = document.getElementById("outputName").value;
    if(!targetKey) { alert("Select target."); return; }
    
    let totalUnits = 0;
    let primaryUnits = 0;
    let used = [];
    let anyRouteChanged = false;

    const target = benzoTypes.find(b => b.key === targetKey);
    const targetSelectedRoute = document.getElementById("outputRoute").value;
    
    for(let i=1; i<=4; i++){
        const suffix = (i === 1) ? '1' : i;
        const d = parseFloat(document.getElementById(`inputDose${suffix}`).value);
        const k = document.getElementById(`inputName${suffix}`).value;
        const userSelectedRoute = document.getElementById(`inputRoute${suffix}`).value;

        if(d > 0 && k) {
            const drug = benzoTypes.find(b => b.key === k);
            const unitVal = (d / drug.equiv);
            totalUnits += unitVal;

            if (i === 1) primaryUnits = unitVal;

            used.push({
                name: drug.label, 
                route: userSelectedRoute || drug.route, 
                dose: d, 
                onset: drug.onset, 
                duration: drug.duration
            });
            
            if (userSelectedRoute && targetSelectedRoute && userSelectedRoute !== targetSelectedRoute) {
              anyRouteChanged = true;
            }
        }
    }
    
    if (used.length === 0) {
        alert("Please enter at least one valid dose.");
        return;
    }

    // --- TRACKING ---
    if (typeof window.trackEvent === 'function') {
        const drugName = document.getElementById('inputName1') ? document.getElementById('inputName1').value : 'Unknown';
        window.trackEvent('clinical_calculation', {
            'event_category': 'Benzodiazepine Calculator',
            'event_label': drugName,
            'institution_id': (typeof window.PALLICALC_USER !== 'undefined' && window.PALLICALC_USER.institutionId) ? window.PALLICALC_USER.institutionId : 'personal_user'
        });
    }
    // ----------------
    
    const res = (totalUnits * target.equiv).toFixed(2);
    
    // Check increase
    let alertMessage = "";
    const primaryTargetDose = primaryUnits * target.equiv;
    const totalTargetDose = totalUnits * target.equiv;
    
    if (primaryTargetDose > 0) {
        const percentIncrease = ((totalTargetDose - primaryTargetDose) / primaryTargetDose) * 100;
        if (percentIncrease >= 30) {
            alertMessage = `<div class="alert-box">Alert: Dose increase ${percentIncrease.toFixed(0)}% compared to primary benzodiazepine dose</div>`;
        }
    }

    let html = alertMessage;
    
    html += `<div style="font-size:1.2em; margin-bottom:12px;">
        <b>Result: <span style="color:#007bff;">${res} mg</span> ${target.label}</b>
    </div>`;
    
    html += `<table class="comparison-table">
        <thead>
            <tr>
                <th>Drug</th>
                <th>Dose</th>
                <th>Onset</th>
                <th>Duration</th>
            </tr>
        </thead>
        <tbody>`;
        
    used.forEach(u => {
        html += `<tr>
            <td>${u.name} <small>(${u.route})</small></td>
            <td>${u.dose} mg</td>
            <td>${u.onset}</td>
            <td>${u.duration}</td>
        </tr>`;
    });
    
    html += `<tr style="background-color:#e6f2ff; font-weight:bold;">
        <td>${target.label} (Target) <small>(${targetSelectedRoute || target.route})</small></td>
        <td>${res} mg</td>
        <td>${target.onset}</td>
        <td>${target.duration}</td>
    </tr>`;
    
    html += `</tbody></table>`;
    
    if (anyRouteChanged) {
        html += `<div class="bio-warning">
          <strong>⚠ Route Change: Parenteral formulations may not use the same conversion ratio.</strong>
          Large variances in oral bioavailability highlight significant inter-patient variability:
          <ul>
            <li>Midazolam: 40% (range 35-75%)</li>
            <li>Lorazepam: >90%</li>
            <li>Diazepam: >90% (range 53-97%)</li>
          </ul>
          Monitor patient response closely.
        </div>`;
    }

    const resultBox = document.getElementById("resultBox");
    // Ensure we are targeting the inner content div if it exists, to preserve the tracking wrapper
    const trackingContent = document.getElementById("tracking-result-content");
    
    if (trackingContent) {
        trackingContent.innerHTML = html;
        resultBox.style.display = 'block';
    } else {
        // Fallback for old structure
        resultBox.innerHTML = html;
        resultBox.style.display = 'block';
    }
    
    resultBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearCalculator() {
    document.querySelectorAll('input[type="number"]').forEach(i => i.value="");
    document.getElementById("resultBox").style.display='none';
    for (let i = 1; i <= 4; i++) {
      const warn = document.getElementById(`warningMsg${i}`);
      if(warn) warn.style.display = 'none';
    }
}

function generateEditTable() {
    const tbody = document.getElementById("ratioTableBody");
    tbody.innerHTML = "";
    
    benzoTypes.forEach(b => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="select-col"><input type="checkbox" data-key="${b.key}" ${includedKeys.has(b.key)?'checked':''} class="item-check"></td>
            <td class="route-col"><select id="editRoute_${b.key}">${ROUTES.map(r=>`<option ${r===b.route?'selected':''}>${r}</option>`)}</select></td>
            <td class="name-col"><input type="text" id="editName_${b.key}" value="${b.label}"></td>
            <td class="equiv-col"><input type="number" step="0.01" id="editEquiv_${b.key}" value="${b.equiv}"></td>
            <td class="data-col"><input type="text" id="editOnset_${b.key}" value="${b.onset}"></td>
            <td class="data-col"><input type="text" id="editDur_${b.key}" value="${b.duration}"></td>
        `;
        tbody.appendChild(tr);
    });

    for (let i = 1; i <= 6; i++) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="select-col"><input type="checkbox" data-new="true" data-idx="${i}" class="new-check"></td>
        <td class="route-col">
          <select id="newRoute_${i}">
            <option value="">Route</option>
            ${ROUTES.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </td>
        <td class="name-col"><input type="text" id="newName_${i}" placeholder="New Drug ${i}"></td>
        <td class="equiv-col"><input type="number" step="0.01" id="newEquiv_${i}" placeholder="Equiv"></td>
        <td class="data-col"><input type="text" id="newOnset_${i}" placeholder="Onset"></td>
        <td class="data-col"><input type="text" id="newDur_${i}" placeholder="Duration"></td>
      `;
      tbody.appendChild(tr);
    }
}

function saveRatios() {
    const userRole = window.PALLICALC_USER ? window.PALLICALC_USER.role : "personal";

    if (userRole !== 'personal') {
      alert("⛔ Access Denied: Institutional changes must be made via the Admin Dashboard.");
      return false;
    }

    const pwd = document.getElementById("passInput").value;
    const msg = document.getElementById("msgArea");
    
    if(pwd !== localStorage.getItem("palliCalcLoginPassword")) { alert("Wrong password"); return false; }
    
    let newTypes = [];
    let newIncluded = [];

    benzoTypes.forEach(b => {
       const cb = document.querySelector(`input[data-key="${b.key}"]`);
       if(cb) {
         if(cb.checked) newIncluded.push(b.key);
         newTypes.push({
            key: b.key,
            label: document.getElementById(`editName_${b.key}`).value,
            route: document.getElementById(`editRoute_${b.key}`).value,
            equiv: parseFloat(document.getElementById(`editEquiv_${b.key}`).value),
            onset: document.getElementById(`editOnset_${b.key}`).value,
            duration: document.getElementById(`editDur_${b.key}`).value
         });
       }
    });

    for (let i = 1; i <= 6; i++) {
       const cb = document.querySelector(`input[data-new="true"][data-idx="${i}"]`);
       const route = document.getElementById(`newRoute_${i}`).value;
       const name = document.getElementById(`newName_${i}`).value;
       const equiv = document.getElementById(`newEquiv_${i}`).value;
       
       if(cb && cb.checked && route && name && equiv) {
          const safeKey = "custom_" + name.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + Math.floor(Math.random()*1000);
          newTypes.push({
             key: safeKey,
             label: name,
             route: route,
             equiv: parseFloat(equiv),
             onset: document.getElementById(`newOnset_${i}`).value || "",
             duration: document.getElementById(`newDur_${i}`).value || ""
          });
          newIncluded.push(safeKey);
       }
    }

    benzoTypes = newTypes;
    includedKeys = new Set(newIncluded);

    localStorage.setItem("benzoTypes", JSON.stringify(benzoTypes));
    localStorage.setItem("benzoIncluded", JSON.stringify(newIncluded));
    localStorage.setItem("benzoSavedTime", new Date().toISOString());
    
    msg.style.display = "inline";
    msg.innerText = "Saved successfully!";
    document.getElementById("passInput").value = "";
    
    setTimeout(() => {
       navigateToCalc();
    }, 1000);
    
    return false;
}

function resetToDefaults() {
    if(confirm("Reset to system defaults?")) { localStorage.removeItem("benzoTypes"); loadSavedData(); generateEditTable(); }
}

/* =========================================
   SAFETY CHECKS (Must be at end)
   ========================================= */
function setupLiveSafetyChecks() {
  ["inputDose1", "inputDose2", "inputDose3", "inputDose4"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", runPassiveSafetyCheck);
  });
}

function runPassiveSafetyCheck() {
  for (let i = 1; i <= 4; i++) {
    const doseEl = document.getElementById(`inputDose${i}`);
    const warningEl = document.getElementById(`warningMsg${i}`);
    
    if (!doseEl || !warningEl) continue;
    
    const dose = parseFloat(doseEl.value);
    let showWarning = false;

    if (!isNaN(dose) && dose > 30) {
      showWarning = true;
    }
    
    warningEl.style.display = showWarning ? 'block' : 'none';
  }
}

// ⚠️ IMPORTANT: Start the application
document.addEventListener("DOMContentLoaded", init);
