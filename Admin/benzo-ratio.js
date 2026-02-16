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
  let benzoTypes = [];
  let includedKeys = new Set();
  
  // Default Data
  const defaultBenzoTypes = [
      { key: "alprazolam", label: "Alprazolam", route: "PO", equiv: 1, onset: "30 min", duration: "6-20 h" },
      { key: "lorazepam", label: "Lorazepam", route: "PO", equiv: 2, onset: "30-60 min", duration: "10-20 h" },
      { key: "bromazepam", label: "Bromazepam", route: "PO", equiv: 6, onset: "30 min - 4 h", duration: "10-20 h" },
      { key: "midazolam_iv", label: "Midazolam", route: "IV", equiv: 4, onset: "1-3 min", duration: "2-4 h" },
      { key: "chlordiazepoxide", label: "Chlordiazepoxide", route: "PO", equiv: 50, onset: "1.5 h", duration: "5-30 h" },
      { key: "midazolam_po", label: "Midazolam", route: "PO", equiv: 10, onset: "10-20 min", duration: "20 min - 3 h" },
      { key: "clonazepam", label: "Clonazepam", route: "PO", equiv: 1, onset: "1 h", duration: "18-39 h" },
      { key: "oxazepam", label: "Oxazepam", route: "PO", equiv: 30, onset: "3 h", duration: "3-21 h" },
      { key: "clorazepate", label: "Clorazepate", route: "PO", equiv: 20, onset: "1 h", duration: "36-200 h" },
      { key: "quazepam", label: "Quazepam", route: "PO", equiv: 40, onset: "20-45 min", duration: "25-100 h" },
      { key: "diazepam", label: "Diazepam", route: "PO", equiv: 15, onset: "30 min", duration: "20-50 h" },
      { key: "temazepam", label: "Temazepam", route: "PO", equiv: 30, onset: "30-60 min", duration: "10-20 h" },
      { key: "flurazepam", label: "Flurazepam", route: "PO", equiv: 30, onset: "1 h", duration: "12-100 h" },
      { key: "triazolam", label: "Triazolam", route: "PO", equiv: 0.5, onset: "30 min", duration: "1.6-5.5 h" }
  ];
  
  const ROUTES = ["PO", "IV", "SL/Buccal", "IM", "SC"];
  
  /* ================= INIT & LISTENERS ================= */
  document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('ratioForm').addEventListener('submit', saveRatios);
      document.getElementById('resetBtn').addEventListener('click', resetToDefaults);
  });
  
  /* ================= AUTH CHECK ================= */
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = "../index.html"; // Go up one level to login
      return;
    }
  
    try {
      const snap = await db.collection("users").doc(user.uid).get();
      if (!snap.exists || snap.data().role !== "institutionAdmin") {
        alert("Access Denied: Institution Admin only.");
        window.location.href = "../index.html";
        return;
      }
  
      currentInstitutionId = snap.data().institutionId;
      if (!currentInstitutionId) throw new Error("No Institution ID linked.");
  
      await loadRatiosFromFirebase();
      document.getElementById("loadingOverlay").style.display = "none";
  
    } catch (e) {
      console.error(e);
      alert("Error loading profile: " + e.message);
      window.location.href = "../index.html";
    }
  });
  
  /* ================= LOAD DATA ================= */
  async function loadRatiosFromFirebase() {
    try {
      const ref = await db.collection("benzoRatios").doc(currentInstitutionId).get();
      
      if (ref.exists && ref.data().benzoTypes) {
        const data = ref.data();
        benzoTypes = data.benzoTypes;
        includedKeys = new Set(data.includedKeys || []);
      } else {
        benzoTypes = JSON.parse(JSON.stringify(defaultBenzoTypes));
        includedKeys = new Set(benzoTypes.map(o => o.key));
      }
      generateTable();
    } catch (e) {
      console.error("Load Failed:", e);
      showErr("Failed to load data. Please refresh.");
    }
  }
  
  /* ================= RENDER TABLE ================= */
  function generateTable() {
    const tbody = document.getElementById("ratioTableBody");
    tbody.innerHTML = "";
  
    // 1. Render Existing Items
    benzoTypes.forEach(b => {
      const tr = document.createElement("tr");
      const isChecked = includedKeys.has(b.key) ? "checked" : "";
      
      const routeOptions = ROUTES.map(r => 
        `<option value="${r}" ${r === b.route ? "selected" : ""}>${r}</option>`
      ).join("");
  
      const safeOnset = b.onset || "-";
      const safeDuration = b.duration || "-";
  
      tr.innerHTML = `
        <td class="text-center">
          <input class="form-check-input" type="checkbox" data-key="${b.key}" ${isChecked}>
        </td>
        <td>
          <select class="form-select form-select-sm" data-field="route">${routeOptions}</select>
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="name" value="${b.label}" required>
        </td>
        <td>
          <input type="number" class="form-control form-control-sm" data-field="equiv" step="0.01" min="0" value="${b.equiv}" required>
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="onset" value="${safeOnset}">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="duration" value="${safeDuration}">
        </td>
      `;
      tbody.appendChild(tr);
    });
  
    // 2. Render 5 Empty Rows for New Items
    for (let i = 1; i <= 5; i++) {
      const tr = document.createElement("tr");
      tr.classList.add("new-row-bg"); 
      
      const routeOptions = ROUTES.map(r => `<option value="${r}">${r}</option>`).join("");
  
      tr.innerHTML = `
        <td class="text-center">
          <input class="form-check-input" type="checkbox" data-is-new="true">
        </td>
        <td>
          <select class="form-select form-select-sm text-muted" data-field="route">
            <option value="" selected>Select</option>
            ${routeOptions}
          </select>
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="name" placeholder="Add New...">
        </td>
        <td>
          <input type="number" class="form-control form-control-sm" data-field="equiv" step="0.01" min="0" placeholder="1.0">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="onset" placeholder="e.g. 30 min">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" data-field="duration" placeholder="e.g. 6-8 h">
        </td>
      `;
      tbody.appendChild(tr);
    }
  }
  
  /* ================= SAVE LOGIC ================= */
  async function saveRatios(e) {
    e.preventDefault();
    const password = document.getElementById("confirmPassword").value;
    const btn = document.getElementById("saveBtn");
    
    document.getElementById("msgArea").style.display = "none";
    document.getElementById("errorArea").style.display = "none";
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
  
    try {
      // 1. Re-auth
      const user = auth.currentUser;
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, password);
      await user.reauthenticateWithCredential(cred);
  
      // 2. Scrape Data
      const newBenzoTypes = [];
      const newIncludedKeys = [];
      const rows = document.querySelectorAll("#ratioTableBody tr");
      
      for (const row of rows) {
        const checkbox = row.querySelector("input[type='checkbox']");
        const routeSelect = row.querySelector("select[data-field='route']");
        const nameInput = row.querySelector("input[data-field='name']");
        const equivInput = row.querySelector("input[data-field='equiv']");
        const onsetInput = row.querySelector("input[data-field='onset']");
        const durInput = row.querySelector("input[data-field='duration']");
  
        if (!checkbox.checked) continue;
  
        let key = checkbox.getAttribute("data-key");
        const route = routeSelect.value;
        const name = nameInput.value.trim();
        let equiv = parseFloat(equivInput.value);
        const onset = onsetInput.value.trim() || "-";
        const duration = durInput.value.trim() || "-";
  
        if (!name || isNaN(equiv) || !route) {
          throw new Error(`Please complete Route, Name, and Equiv for: ${name || "Unnamed"}`);
        }
  
        if (!key) {
           key = `custom_${Date.now()}_${Math.floor(Math.random() * 100)}`;
        }
  
        newBenzoTypes.push({ key, label: name, route, equiv, onset, duration });
        newIncludedKeys.push(key);
      }
  
      // 3. Save to Firestore
      await db.collection("benzoRatios").doc(currentInstitutionId).set({
        benzoTypes: newBenzoTypes,
        includedKeys: newIncludedKeys,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.email
      });
  
      // 4. Update Institution Doc
      await db.collection("institutions").doc(currentInstitutionId).set({
        customBenzoRatios: true
      }, { merge: true });
  
      showMsg("Success! Configuration updated.");
      document.getElementById("confirmPassword").value = "";
      
      benzoTypes = newBenzoTypes;
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
  
  /* ================= RESET ================= */
  function resetToDefaults() {
    if (!confirm("Revert visual table to system defaults? (Must click SAVE to apply)")) return;
    benzoTypes = JSON.parse(JSON.stringify(defaultBenzoTypes));
    includedKeys = new Set(benzoTypes.map(o => o.key));
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