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

const ROUTES = ["IV", "SC", "SC/IV", "TD", "PO", "SL", "NAS"];
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

let opioidTypes = [];
let toPoMorphineRatios = {};
let fromPoMorphineRatios = {};
let includedKeys = new Set();

function prettifyKey(key) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

// Always loads defaults for the demo
function loadDefaults() {
  opioidTypes = defaultOpioidTypes.map(op => {
    const [route, name] = splitOpioidKey(op.key);
    return { ...op, label: name, route: route };
  });
  toPoMorphineRatios = { ...defaultToPoMorphineRatios };
  fromPoMorphineRatios = { ...defaultFromPoMorphineRatios };
  includedKeys = new Set(opioidTypes.map(o => o.key));
}

function navigateToEdit() {
  document.getElementById("calcPage").style.display = "none";
  document.getElementById("editPage").style.display = "block";
  document.getElementById("toEditLink").style.display = "none";
  document.getElementById("toCalcLink").style.display = "";
  generateEditTable();
  document.getElementById("clearBtn").style.display = "none";
}

function navigateToCalc() {
  document.getElementById("editPage").style.display = "none";
  document.getElementById("calcPage").style.display = "block";
  document.getElementById("toEditLink").style.display = "";
  document.getElementById("toCalcLink").style.display = "none";
  
  // Update ratios based on whatever is currently in the inputs (TEMPORARY FOR DEMO SESSION)
  updateRatiosFromInputs(); 
  fillAllSelects();
  
  document.getElementById("clearBtn").style.display = "block";
}

// New: Updates the internal calculation ratios based on what user typed in Edit table
// allowing them to "test" new numbers without saving to database.
function updateRatiosFromInputs() {
    const tbody = document.getElementById("ratioTableBody");
    const rows = tbody.querySelectorAll("tr");
    
    // Reset included keys to reflect current checkboxes
    includedKeys.clear();

    for (let row of rows) {
        const selectCheckbox = row.querySelector('input[type="checkbox"]');
        const ratioInput = row.querySelector('input.ratio-input'); 
        const key = selectCheckbox ? selectCheckbox.getAttribute('data-key') : null;
        
        if (selectCheckbox && selectCheckbox.checked && key) {
            includedKeys.add(key);
            
            // Update temporary ratio if changed
            if (ratioInput) {
                const val = parseFloat(ratioInput.value);
                if (!isNaN(val) && val > 0) {
                    toPoMorphineRatios[key] = val;
                    fromPoMorphineRatios[key] = 1 / val;
                }
            }
        }
    }
}

// Updated to match Opioid-calculator.html column design
function generateEditTable() {
  const tbody = document.getElementById("ratioTableBody");
  tbody.innerHTML = "";
  opioidTypes.forEach(op => {
    const checkedAttr = includedKeys.has(op.key) ? "checked" : "";
    let tr = document.createElement("tr");
    const routeOptions = ROUTES.map(r => `<option value="${r}"${r === op.route ? " selected" : ""}>${r}</option>`).join('');
    tr.innerHTML = `
      <td class="select-col"><input type="checkbox" id="select_${op.key}" data-key="${op.key}" ${checkedAttr}></td>
      <td class="route-col"><select id="editRoute_${op.key}" class="route-select" disabled>${routeOptions}</select></td>
      <td class="opioid-name-col"><input type="text" id="editName_${op.key}" value="${op.label}" readonly class="input-readonly"></td>
      <td class="ratio-col"><input type="number" class="ratio-input" min="0.001" step="0.0001" value="${toPoMorphineRatios[op.key]}" id="editRatio_${op.key}"></td>
      <td class="unit-col"><input type="text" value="${op.unit}" id="editUnit_${op.key}" readonly class="input-readonly"></td>
    `;
    tbody.appendChild(tr);
  });
}

function resetToDefaults() {
  if (!confirm("Reset to default values?")) return;
  loadDefaults();
  generateEditTable();
}

// Standard DOM manipulation logic
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
      if (
        includedKeys.has(op.key) &&
        ROUTES.includes(op.route) &&
        op.route !== "SC/IV" &&
        op.route !== "TD"
      ) {
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
      .filter(
        op =>
          includedKeys.has(op.key) &&
          (op.route === route ||
            (op.route === "SC/IV" && (route === "SC" || route === "IV")))
      )
      .map(op => op.label)
      .sort();
  }

  function fillRouteSelects(ids) {
    ids.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      // Preserve selection if possible
      const currentVal = sel.value;
      
      sel.innerHTML = "";
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "1. Select route";
      sel.appendChild(emptyOption);
      if (id === "prnRouteSelect") {
        filteredPrnRoutes().forEach(r => {
          const option = document.createElement("option");
          option.value = r;
          option.textContent = r;
          sel.appendChild(option);
        });
      } else {
        filteredRoutes().forEach(r => {
          const option = document.createElement("option");
          option.value = r;
          option.textContent = r;
          sel.appendChild(option);
        });
      }
      
      if(currentVal) sel.value = currentVal;
      if(sel.selectedIndex === -1) sel.selectedIndex = 0;
    });
  }

  function fillNameSelects(routeSelectId, nameSelectId, unitSpanId) {
    const routeSel = document.getElementById(routeSelectId);
    const nameSel = document.getElementById(nameSelectId);
    const unitSpan = unitSpanId ? document.getElementById(unitSpanId) : null;
    if (!routeSel || !nameSel) return;
    const selectedRoute = routeSel.value;
    
    const currentName = nameSel.value;

    nameSel.innerHTML = "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "2. Select opioid";
    nameSel.appendChild(emptyOption);
    if (!selectedRoute) {
      if (unitSpan) unitSpan.textContent = "";
      return;
    }
    const names = namesForRoute(selectedRoute);
    names.forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      nameSel.appendChild(option);
    });
    
    if(names.includes(currentName)) {
        nameSel.value = currentName;
    } else {
        nameSel.selectedIndex = 0;
    }
    
    if (unitSpan) updateUnit(routeSelectId, nameSelectId, unitSpanId);
  }

  function updateUnit(routeSelId, nameSelId, unitSpanId) {
    const route = document.getElementById(routeSelId).value;
    const name = document.getElementById(nameSelId).value;
    const unitSpan = document.getElementById(unitSpanId);
    if (!route || !name) {
      if (unitSpan) unitSpan.textContent = "";
      return;
    }
    const key = findKey(route, name);
    if (unitSpan) {
      unitSpan.textContent = formatUnit(key);
    }
  }

  inputRoutes.forEach((routeId, idx) => {
    document.getElementById(routeId).addEventListener("change", () => {
      fillNameSelects(routeId, inputNames[idx], `inputUnit${idx + 1}`);
      updateUnit(routeId, inputNames[idx], `inputUnit${idx + 1}`);
    });
    document.getElementById(inputNames[idx]).addEventListener("change", () => {
      updateUnit(routeId, inputNames[idx], `inputUnit${idx + 1}`);
    });
  });

  document.getElementById("outputRoute").addEventListener("change", () =>
    fillNameSelects("outputRoute", "outputName")
  );

  fillRouteSelects(inputRoutes.concat(outputRoutes, prnRoutes));
  inputRoutes.forEach((routeId, idx) => fillNameSelects(routeId, inputNames[idx]));
  outputRoutes.forEach(id => fillNameSelects(id, outputNames[0]));
  prnRoutes.forEach(id => fillNameSelects(id, prnNames[0]));

  function addRouteChangeListener(routeId, nameId) {
    const routeSel = document.getElementById(routeId);
    routeSel.addEventListener("change", () => fillNameSelects(routeId, nameId));
  }
  inputRoutes.forEach((routeId, idx) => addRouteChangeListener(routeId, inputNames[idx]));
  outputRoutes.forEach(routeId => addRouteChangeListener(routeId, outputNames[0]));
  prnRoutes.forEach(routeId => addRouteChangeListener(routeId, prnNames[0]));

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
}

function findKey(route, name) {
  route = route.toUpperCase();
  let found = opioidTypes.find(op => op.route === route && op.label === name);
  if (!found && (route === "SC" || route === "IV")) {
    found = opioidTypes.find(op => op.route === "SC/IV" && op.label === name);
  }
  return found ? found.key : "";
}

let prnClickCount = 0;
function togglePrn() {
  prnClickCount = (prnClickCount + 1) % 4;
  const prn1 = document.getElementById("prnOpioid1");
  const prn2 = document.getElementById("prnOpioid2");
  const prn3 = document.getElementById("prnOpioid3");
  const btn = document.getElementById("showPrnBtn");
  if (prnClickCount === 0) {
    prn1.style.display = "none";
    prn2.style.display = "none";
    prn3.style.display = "none";
    btn.textContent = "Add Additional/PRN Opioid 1";
  } else if (prnClickCount === 1) {
    prn1.style.display = "block";
    prn2.style.display = "none";
    prn3.style.display = "none";
    btn.textContent = "Add Additional/PRN Opioid 2";
  } else if (prnClickCount === 2) {
    prn1.style.display = "block";
    prn2.style.display = "block";
    prn3.style.display = "none";
    btn.textContent = "Add Additional/PRN Opioid 3";
  } else if (prnClickCount === 3) {
    prn1.style.display = "block";
    prn2.style.display = "block";
    prn3.style.display = "block";
    btn.textContent = "Hide Additional/PRN Opioids";
  }
}

function formatUnit(type) {
  const found = opioidTypes.find(op => op.key === type);
  if (found) return found.unit;
  switch (type) {
    case "fentanyl_patch":
      return "mcg/hr (TD fentanyl patch)";
    case "sc_fentanyl":
      return "mcg (SC fentanyl)";
    default:
      return "mg";
  }
}

function getDoseValue(id) {
  const val = parseFloat(document.getElementById(id).value);
  return isNaN(val) || val < 0 ? 0 : val;
}

let lastTotalPoMorphine = 0;
function convert() {
  const doses = [
    getDoseValue("inputDose1"),
    getDoseValue("inputDose2"),
    getDoseValue("inputDose3"),
    getDoseValue("inputDose4")
  ];
  const types = [
    window.getKeyByInput(1),
    window.getKeyByInput(2),
    window.getKeyByInput(3),
    window.getKeyByInput(4)
  ];
  const outputType = window.getKeyByOutput();

  if (doses.some(d => d < 0)) {
    alert("Please enter valid non-negative doses for all opioids.");
    return;
  }
  if (doses.every(d => d === 0)) {
    alert("Please enter at least one positive opioid dose.");
    return;
  }
  let totalPoMorphine = 0;
  for (let i = 0; i < 4; i++) {
    if (!types[i]) continue;
    const ratio = toPoMorphineRatios[types[i]];
    if (ratio === undefined) {
      alert(`Calculation error: opioid ratio for "${types[i]}" not found.`);
      return;
    }
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

  let message =
    alertMessage +
    `<div class="equivalent-dose">Total Daily Equivalent dose (without cross-tolerance adjustment) [${outputRouteDisplay} ${outputNameDisplay}]: ${outputDoseNoAdjustment.toFixed(0)} ${formatUnit(outputType)}/day <a href="../guides/opioid-conversion.html" class="info-icon" data-tooltip="Opioid Conversion Calculation" aria-label="Opioid conversion details" title="View calculation method"><i class="bi bi-info-circle"></i></a></div>`;

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
  const outputRouteElem = document.getElementById("outputRoute");
  const outputRouteValue = outputRouteElem ? outputRouteElem.value.toUpperCase() : "";
  const inputRoutes = [
    document.getElementById("inputRoute1")?.value.toUpperCase() || "",
    document.getElementById("inputRoute2")?.value.toUpperCase() || "",
    document.getElementById("inputRoute3")?.value.toUpperCase() || ""
  ];
  const hasPoInput = inputRoutes.some(route => route === "PO");
  const outputIsNotPo = outputRouteValue !== "PO";
  if (hasPoInput && outputIsNotPo) {
    message += `<div class="note">Note: do not include PRN oral doses in the total daily dose calculation if the patient has severe constipation or impaired oral absorption.</div>`;
  }

  const primaryInputType = types[0];
  const outputTypeKey = outputType;

  const isFentanylSwitch =
    (primaryInputType === "td_fentanyl_patch" && outputTypeKey === "sciv_fentanyl") ||
    (primaryInputType === "sciv_fentanyl" && outputTypeKey === "td_fentanyl_patch");

  const primaryInputName = opioidTypes.find(op => op.key === primaryInputType)?.label || "";
  const outputName = opioidTypes.find(op => op.key === outputTypeKey)?.label || "";
  const isDifferentOpioidName = primaryInputName !== outputName;

  if (isDifferentOpioidName && totalPoMorphine > 100 && !isFentanylSwitch) {
    const reducedDose25 = outputDoseNoAdjustment * 0.75;
    const reducedDose50 = outputDoseNoAdjustment * 0.5;
    message +=
      `<div class="note-title" style="color: red;">⚠️ CAUTION: INCOMPLETE CROSS-TOLERANCE</div>` +
      `Switching from one high-dose opioid to another, consider DOSE REDUCTION of 25%-50%.` +
      `<table><thead><tr><th>Reduction</th><th>Dose</th><th>Unit</th></tr></thead>` +
      `<tbody><tr><td>25% Reduced Dose</td><td>${reducedDose25.toFixed(0)}</td><td>${formatUnit(outputType)}</td></tr>` +
      `<tr><td>50% Reduced Dose</td><td>${reducedDose50.toFixed(0)}</td><td>${formatUnit(outputType)}</td></tr></tbody></table>` +
      `<div style="margin-top:8px;">Monitor patient response closely.</div>`;
  }
  const resultDiv = document.getElementById("resultBox");
  resultDiv.innerHTML = message;
  resultDiv.style.display = "block";
  resultDiv.scrollIntoView({ behavior: "smooth", block: "center" });

  const prnCalcDiv = document.getElementById("prnCalculation");
  prnCalcDiv.style.display = "block";
  document.getElementById("prnRouteSelect").value = "";
  const prnOutput = document.getElementById("prnDoseOutput");
  prnOutput.innerHTML = "";
  prnOutput.style.display = "none";
}

function calculateNewPrnDose() {
  const outputDiv = document.getElementById("prnDoseOutput");
  const selectedRoute = document.getElementById("prnRouteSelect").value;
  const selectedName = document.getElementById("prnNameSelect").value;

  if (!selectedRoute || !selectedName) {
    outputDiv.innerText = "";
    outputDiv.style.display = "none";
    return;
  }

  const prnOp = opioidTypes.find(
    op =>
      op.label === selectedName &&
      (op.route === selectedRoute ||
        ((selectedRoute === "SC" || selectedRoute === "IV") && op.route === "SC/IV"))
  );
  const prnKey = prnOp ? prnOp.key : "";
  if (!prnKey || lastTotalPoMorphine === 0) {
    outputDiv.innerText = "";
    outputDiv.style.display = "none";
    return;
  }

  const prnMin = lastTotalPoMorphine / 12;
  const prnMax = lastTotalPoMorphine / 6;
  const prnMinConverted = prnMin * fromPoMorphineRatios[prnKey];
  const prnMaxConverted = prnMax * fromPoMorphineRatios[prnKey];
  const unit = formatUnit(prnKey);

  outputDiv.innerHTML = `New PRN Dose Range (${selectedRoute} ${selectedName}): ${prnMinConverted.toFixed(
    0
  )} - ${prnMaxConverted.toFixed(0)} ${unit}
  <a href="../guides/prn-calculation.html" class="prn-icon info-icon" data-tooltip="PRN dose calculation" aria-label="PRN dose details" title="View PRN calculation">
    <i class="bi bi-exclamation-circle"></i>
  </a>`;
  outputDiv.style.display = "block";
  outputDiv.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearCalculator() {
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
  const prnOutput = document.getElementById("prnDoseOutput");
  prnOutput.innerHTML = "";
  prnOutput.style.display = "none";
  
  // Hide warnings
  for (let i = 1; i <= 4; i++) {
    const warn = document.getElementById(`warningMsg${i}`);
    if(warn) warn.style.display = 'none';
  }

  lastTotalPoMorphine = 0;
}

// ==========================================
// 🛡️ LIVE SAFETY CHECK SYSTEM (Unit-Specific)
// ==========================================

function setupLiveSafetyChecks() {
  // Listen to dose inputs (1-4)
  ["inputDose1", "inputDose2", "inputDose3", "inputDose4"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", runPassiveSafetyCheck);
  });

  // Listen to dropdown changes
  document.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", runPassiveSafetyCheck);
  });
}

function runPassiveSafetyCheck() {
  // Loop through all 4 inputs
  for (let i = 1; i <= 4; i++) {
    const doseEl = document.getElementById(`inputDose${i}`);
    const warningEl = document.getElementById(`warningMsg${i}`);
    
    if (!doseEl || !warningEl) continue;
    
    const dose = parseFloat(doseEl.value);
    // Default: hide warning
    let showWarning = false;

    if (!isNaN(dose) && dose > 0) {
      // Get the Drug Key safely using your existing helper
      let typeKey = "";
      if (typeof window.getKeyByInput === 'function') {
        typeKey = window.getKeyByInput(i);
      }

      if (typeKey) {
        // UNIT-BASED LIMIT CHECK (Your Exact Rules)
        const opObj = opioidTypes.find(op => op.key === typeKey);
        
        if (opObj && opObj.unit) {
          const unit = opObj.unit.toLowerCase();
          let limit = 0;

          // Define limits based on unit
          if (unit === "mg") limit = 200;
          else if (unit === "mcg") limit = 2000;
          else if (unit.includes("mcg/hr")) limit = 100; // Covers Fentanyl Patches

          // If dose exceeds limit
          if (limit > 0 && dose > limit) {
            showWarning = true;
          }
        }
      }
    }
    
    // Show or hide the specific inline warning for this input
    warningEl.style.display = showWarning ? 'block' : 'none';
  }
}

function init() {
  // 1. Load default data
  loadDefaults();
  
  // 2. Setup UI
  document.getElementById("calcPage").style.display = "block";
  document.getElementById("editPage").style.display = "none";
  fillAllSelects();

  // 3. Add Listeners
  document.getElementById("prnRouteSelect").addEventListener("change", () => {
    const prnRoute = document.getElementById("prnRouteSelect").value;
    const prnNameSelect = document.getElementById("prnNameSelect");
    prnNameSelect.innerHTML = "";
    if (prnRoute) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "Select opioid";
      prnNameSelect.appendChild(emptyOption);
      opioidTypes
        .filter(op => {
          if (op.key === "fentanyl_patch") return false;
          if (prnRoute === "SC" || prnRoute === "IV") {
            return includedKeys.has(op.key) && (op.route === prnRoute || op.route === "SC/IV");
          } else {
            return includedKeys.has(op.key) && op.route === prnRoute;
          }
        })
        .forEach(op => {
          const option = document.createElement("option");
          option.value = op.label;
          option.textContent = op.label;
          prnNameSelect.appendChild(option);
        });
      prnNameSelect.selectedIndex = 0;
      calculateNewPrnDose();
    } else {
      document.getElementById("prnDoseOutput").style.display = "none";
    }
  });

  document.getElementById("prnNameSelect").addEventListener("change", calculateNewPrnDose);

  // 4. Activate Live Safety Check
  setupLiveSafetyChecks();
}

document.addEventListener("DOMContentLoaded", init);