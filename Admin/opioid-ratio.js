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
    link.href = '/favicon.png'; 
})();

/* ================= FIREBASE CONFIG ================= */
const firebaseConfig = {
    apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
    authDomain: "pallicalc-eabdc.firebaseapp.com",
    projectId: "pallicalc-eabdc",
    storageBucket: "pallicalc-eabdc.firebasestorage.app",
    messagingSenderId: "347532270864",
    appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  /* ================= GLOBAL STATE ================= */
  let currentInstitutionId = null;
  let opioidTypes = [];
  let includedKeys = new Set();
  
  // Defaults
  const defaultOpioidTypes = [
    { key: "po_morphine", label: "Morphine", unit: "mg", ratio: 1, route: "PO" },
    { key: "sciv_morphine", label: "Morphine", unit: "mg", ratio: 2, route: "SC/IV" },
    { key: "po_oxycodone", label: "Oxycodone", unit: "mg", ratio: 1.5, route: "PO" },
    { key: "sciv_oxycodone", label: "Oxycodone", unit: "mg", ratio: 3, route: "SC/IV" },
    { key: "po_tramadol", label: "Tramadol", unit: "mg", ratio: 0.2, route: "PO" },
    { key: "iv_tramadol", label: "Tramadol", unit: "mg", ratio: 0.2, route: "IV" },
    { key: "po_codeine", label: "Codeine", unit: "mg", ratio: 0.1, route: "PO" },
    { key: "po_dihydrocodeine", label: "Dihydrocodeine", unit: "mg", ratio: 0.1, route: "PO" },
    { key: "td_fentanyl_patch", label: "Fentanyl Patch", unit: "mcg/hr", ratio: 2.4, route: "TD" },
    { key: "sciv_fentanyl", label: "Fentanyl", unit: "mcg", ratio: 0.1, route: "SC/IV" }
  ];

  const ROUTES = ["PO", "SC", "IV", "SC/IV", "TD", "SL", "NAS"];

  /* ================= SAFETY LIMITS ================= */
  const ratioLimits = {
    'po:morphine': {min: 0.9, max: 1.1},
    'sciv:morphine': {min: 1.5, max: 3.0},
    'po:oxycodone': {min: 1.2, max: 2.0},
    'sciv:oxycodone': {min: 2.0, max: 4.0},
    'po:tramadol': {min: 0.15, max: 0.25},
    'iv:tramadol': {min: 0.15, max: 0.25},
    'po:codeine': {min: 0.08, max: 0.15},
    'po:dihydrocodeine': {min: 0.08, max: 0.15},
    'td:fentanylpatch': {min: 1.8, max: 3.6},
    'sciv:fentanyl': {min: 0.07, max: 0.15},
    'po:hydromorphone': {min: 4.0, max: 7.5},
    'sciv:hydromorphone': {min: 8.0, max: 15.0}
  };

  /* ================= INIT & LISTENERS ================= */
  document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('ratioForm').addEventListener('submit', saveRatios);
      document.getElementById('resetBtn').addEventListener('click', resetToDefaults);
  });

  /* ================= AUTH CHECK ================= */
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = "../index.html";
      return;
    }
    try {
      const snap = await db.collection("users").doc(user.uid).get();
      if (!snap.exists || snap.data().role !== "institutionAdmin") {
        alert("Access Denied.");
        window.location.href = "../index.html";
        return;
      }
      currentInstitutionId = snap.data().institutionId;
      await loadRatiosFromFirebase();
      document.getElementById("loadingOverlay").style.display = "none";
    } catch (e) {
      console.error(e);
      alert("Error loading profile: " + e.message);
    }
  });

  /* ================= LOAD DATA ================= */
  async function loadRatiosFromFirebase() {
    try {
      const ref = await db.collection("opioidRatios").doc(currentInstitutionId).get();
      if (ref.exists && ref.data().opioidTypes) {
        opioidTypes = ref.data().opioidTypes;
        includedKeys = new Set(ref.data().includedKeys || []);
      } else {
        opioidTypes = JSON.parse(JSON.stringify(defaultOpioidTypes));
        includedKeys = new Set(opioidTypes.map(o => o.key));
      }
      generateTable();
    } catch (e) {
      console.error("Load Failed:", e);
      showErr("Failed to load data. Please refresh.");
    }
  }

  /* ================= VALIDATION LOGIC ================= */
  window.validateRatio = function(input) {
    const row = input.closest('tr');
    const checkbox = row.querySelector('input[type="checkbox"]');
    
    let key;
    const rawDataKey = checkbox.getAttribute('data-key');
    
    if (rawDataKey) {
        key = rawDataKey.replace('_', ':').toLowerCase();
    } else {
        const route = row.querySelector('select[data-field="route"]').value.toLowerCase().replace(/[^a-z0-9]/g, '');
        const name = row.querySelector('input[data-field="name"]').value.toLowerCase().replace(/[^a-z0-9]/g, '');
        key = `${route}:${name}`;
    }

    const limit = ratioLimits[key] || {min: 0.0001, max: 1000};
    const ratio = parseFloat(input.value);
    
    input.classList.remove('is-invalid');
    let errDiv = input.parentNode.querySelector('.invalid-feedback');
    if(errDiv) errDiv.remove();

    if (!isNaN(ratio) && (ratio < limit.min || ratio > limit.max)) {
        input.classList.add('is-invalid');
        errDiv = document.createElement('div');
        errDiv.className = 'invalid-feedback';
        errDiv.innerText = `Range: ${limit.min} - ${limit.max}`;
        input.parentNode.appendChild(errDiv);
    }
  }

  /* ================= RENDER TABLE ================= */
  function generateTable() {
    const tbody = document.getElementById("ratioTableBody");
    tbody.innerHTML = "";

    // 1. Render Existing Opioids
    opioidTypes.forEach(op => {
      const tr = document.createElement("tr");
      const isChecked = includedKeys.has(op.key) ? "checked" : "";
      
      const routeOptions = ROUTES.map(r => 
        `<option value="${r}" ${r === op.route ? "selected" : ""}>${r}</option>`
      ).join("");

      tr.innerHTML = `
        <td class="text-center">
          <input class="form-check-input" type="checkbox" data-key="${op.key}" ${isChecked}>
        </td>
        <td>
          <select class="form-select form-select-sm" data-field="route">${routeOptions}</select>
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="name" value="${op.label}" required>
        </td>
        <td>
          <input type="number" class="form-control form-control-sm" data-field="ratio" step="0.0001" min="0" value="${op.ratio}" oninput="validateRatio(this)" required>
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="unit" value="${op.unit}">
        </td>
      `;
      tbody.appendChild(tr);
    });

    // 2. Render 5 Empty Rows
    for (let i = 1; i <= 5; i++) {
      const tr = document.createElement("tr");
      tr.classList.add("new-row-bg");
      
      const routeOptions = ROUTES.map(r => `<option value="${r}">${r}</option>`).join("");

      tr.innerHTML = `
        <td class="text-center">
          <input class="form-check-input" type="checkbox" data-is-new="true">
        </td>
        <td>
          <select class="form-select form-select-sm text-muted" data-field="route" onchange="validateRatio(this.closest('tr').querySelector('input[data-field=\\'ratio\\']'))">
            <option value="" selected>Select</option>
            ${routeOptions}
          </select>
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="name" placeholder="Name..." oninput="validateRatio(this.closest('tr').querySelector('input[data-field=\\'ratio\\']'))">
        </td>
        <td>
          <input type="number" class="form-control form-control-sm" data-field="ratio" step="0.0001" min="0" placeholder="0.0" oninput="validateRatio(this)">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="unit" placeholder="mg">
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  /* ================= SAVE LOGIC ================= */
  async function saveRatios(e) {
    e.preventDefault();
    
    // Validation check
    const rows = document.querySelectorAll("#ratioTableBody tr");
    rows.forEach(row => {
        const checkbox = row.querySelector("input[type='checkbox']");
        const ratioInput = row.querySelector("input[data-field='ratio']");
        if (checkbox && checkbox.checked && ratioInput) {
            validateRatio(ratioInput);
        }
    });

    if (document.querySelectorAll('.is-invalid').length > 0) {
        showErr("Action Blocked: Please correct the red highlighted ratio errors before saving.");
        return false;
    }

    const password = document.getElementById("confirmPassword").value;
    const btn = document.getElementById("saveBtn");
    
    document.getElementById("msgArea").style.display = "none";
    document.getElementById("errorArea").style.display = "none";
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
      const user = auth.currentUser;
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, password);
      await user.reauthenticateWithCredential(cred);

      const newOpioidTypes = [];
      const newIncludedKeys = [];
      const toPoMorphineRatios = {};
      const fromPoMorphineRatios = {};

      for (const row of rows) {
        const checkbox = row.querySelector("input[type='checkbox']");
        if (!checkbox.checked) continue;

        const routeSelect = row.querySelector("select[data-field='route']");
        const nameInput = row.querySelector("input[data-field='name']");
        const ratioInput = row.querySelector("input[data-field='ratio']");
        const unitInput = row.querySelector("input[data-field='unit']");

        let key = checkbox.getAttribute("data-key");
        const route = routeSelect.value;
        const name = nameInput.value.trim();
        let ratio = parseFloat(ratioInput.value);
        const unit = unitInput.value.trim();

        if (!name || isNaN(ratio) || !route) {
          throw new Error(`Incomplete fields for: ${name || "Unnamed Item"}`);
        }

        if (!key) {
           const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
           const safeRoute = route.toLowerCase().replace(/[^a-z0-9]/g, '');
           key = `${safeRoute}_${safeName}`;
        }

        // Handle duplicates if user types same name twice
        if (newOpioidTypes.find(o => o.key === key)) {
          key = key + "_" + Math.floor(Math.random() * 1000);
        }

        newOpioidTypes.push({ key, route, label: name, ratio, unit });
        newIncludedKeys.push(key);
        toPoMorphineRatios[key] = ratio;
        fromPoMorphineRatios[key] = (ratio === 0) ? 0 : (1 / ratio);
      }

      await db.collection("opioidRatios").doc(currentInstitutionId).set({
        opioidTypes: newOpioidTypes,
        includedKeys: newIncludedKeys,
        toPoMorphineRatios: toPoMorphineRatios,
        fromPoMorphineRatios: fromPoMorphineRatios,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.email
      });

      await db.collection("institutions").doc(currentInstitutionId).set({
        customRatios: true
      }, { merge: true });

      showMsg("Success! Ratios saved safely.");
      document.getElementById("confirmPassword").value = "";
      
      opioidTypes = newOpioidTypes;
      includedKeys = new Set(newIncludedKeys);
      generateTable(); 

    } catch (err) {
      console.error(err);
      if (err.code === 'auth/wrong-password') {
        showErr("Incorrect password.");
      } else {
        showErr("Error: " + err.message);
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-save"></i> Save Changes';
    }
  }

  function resetToDefaults() {
    if (!confirm("Revert table to defaults? (Must click SAVE to apply)")) return;
    opioidTypes = JSON.parse(JSON.stringify(defaultOpioidTypes));
    includedKeys = new Set(opioidTypes.map(o => o.key));
    generateTable();
    showMsg("Visuals reset. Enter password and click SAVE to commit.");
  }

  function showMsg(txt) {
    const el = document.getElementById("msgArea");
    el.textContent = txt;
    el.style.display = "block";
    el.className = "alert alert-success mt-2";
  }

  function showErr(txt) {
    const el = document.getElementById("errorArea");
    el.textContent = txt;
    el.style.display = "block";
    el.className = "alert alert-danger mt-2";
  }