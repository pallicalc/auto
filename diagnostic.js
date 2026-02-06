// --- Auto-Inject Favicon into Header ---
(function() {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = '/favicon.png'; 
})();

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
    authDomain: "pallicalc-eabdc.firebaseapp.com",
    projectId: "pallicalc-eabdc",
    storageBucket: "pallicalc-eabdc.firebasestorage.app",
    messagingSenderId: "347532270864",
    appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995",
    measurementId: "G-6G9C984F8E"
};

let auth, db;
let currentUserRole = "guest";
let userInstId = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    generateToolLinks(); 
    
    // Attach Standard Event Listeners
    if(document.getElementById('openSettingsBtn')) {
        document.getElementById('openSettingsBtn').addEventListener('click', openSettings);
        document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
    }
    if(document.getElementById('openScannerBtn')) {
        document.getElementById('openScannerBtn').addEventListener('click', () => {
            window.location.href = 'diagnostic/scan.html';
        });
    }
    if(document.getElementById('institutionForm')) {
        document.getElementById('institutionForm').addEventListener('submit', saveSettings);
    }

    // Trigger Badge Update on Load
    if(document.getElementById('cardBadge')) {
        updateBadgeCount();
    }
});

// --- 1. CONFIGURATION FOR DIAGNOSTIC TOOLS ---
const toolConfig = {
    languages: { 
        en: { flag: '🇬🇧', label: 'English', filename: 'eng.html' },
        zh: { flag: '🇨🇳', label: '中文', filename: 'ch.html' },
        ms: { flag: '🇲🇾', label: 'Bahasa', filename: 'bm.html' } 
    },
    tools: { 
        ipos:       ['en', 'zh', 'ms'],
        hads:       ['en', 'zh', 'ms'],
        distress:   ['en', 'zh', 'ms']
    }
};

// --- 2. GENERATE FLAGS ---
function generateToolLinks() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');

    Object.entries(toolConfig.tools).forEach(([toolId, availableLangs]) => {
        const section = document.querySelector(`[data-tool="${toolId}"] .language-icons`);
        if (!section) return;

        section.innerHTML = ''; 

        availableLangs.forEach(langCode => {
            const langData = toolConfig.languages[langCode];
            const link = document.createElement('a');
            const baseUrl = `diagnostic/${toolId}/${langData.filename}`;
            link.href = ref ? `${baseUrl}?ref=${ref}` : baseUrl;
            link.className = 'lang-icon-link'; 
            link.innerHTML = `
              <div class="lang-icon" style="font-size:24px;">${langData.flag}</div>
              <div class="lang-label" style="font-size:12px;">${langData.label}</div>
            `;
            section.appendChild(link);
        });
    });
}

// --- STANDARD APP LOGIC ---
async function initApp() {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const snap = await db.collection('users').doc(user.uid).get();
                if (snap.exists) {
                    currentUserRole = snap.data().role || "personal";
                    userInstId = snap.data().institutionId || null;
                }
            } catch (e) { console.error(e); }
        }
        applyViewLogic();
    });
}

async function applyViewLogic() {
    const settingsSection = document.getElementById('settingsCallout');
    const shareSection = document.getElementById('shareCallout');
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRef = urlParams.get('ref');

    if (sharedRef) {
        if(settingsSection) settingsSection.style.display = 'none';
        if(shareSection) shareSection.style.display = 'none';
        await loadInstitutionFromFirebase(sharedRef, true);
        document.querySelectorAll('.btn-start-assess').forEach(btn => {
            btn.href = btn.href.includes('?') ? btn.href + "&ref=" + sharedRef : btn.href + "?ref=" + sharedRef;
        });
        return;
    }

    if ((currentUserRole === 'institutionUser' || currentUserRole === 'institutionAdmin') && userInstId) {
        await loadInstitutionFromFirebase(userInstId, false);
        if(settingsSection) settingsSection.style.display = 'none';
        if(shareSection) shareSection.style.display = 'block';
    } else {
        if(settingsSection) settingsSection.style.display = 'block';
        if(shareSection) shareSection.style.display = 'block'; 
        loadLocalSettings();
    }
}

function updateBanner(type, sourceName) {
    const banner = document.getElementById('sourceBanner');
    if(!banner) return;
    banner.style.display = 'block';
    
    if (type === 'shared') {
        banner.innerHTML = `<strong>Viewing Shared Page:</strong> <span class="source-shared">${sourceName}</span>`;
    } else if (type === 'custom_firebase') {
        banner.innerHTML = `<strong>${sourceName}:</strong> <span class="source-custom">Official Header Loaded</span>`;
    } else if (type === 'custom_local') {
        banner.innerHTML = `<strong>Personal User:</strong> <span class="source-custom">Custom Header (Local)</span>`;
    } else {
        banner.style.display = 'none';
    }
}

function loadLocalSettings() {
    const settings = JSON.parse(localStorage.getItem('institutionSettings') || '{}');
    if (settings.name) renderHeader(settings);
    else renderPlaceholder();
}

// [FETCH DATA INCLUDING LINKS]
async function loadInstitutionFromFirebase(instId, isSharedLink) {
    try {
        const doc = await db.collection('institutions').doc(instId).get();
        if (doc.exists) {
            const data = doc.data();
            
            const settings = {
                name: data.headerName || data.name,
                contact: data.headerContact,
                logos: data.headerLogos || [],
                links: data.diagnosticLinks || {} // Store links
            };

            localStorage.setItem('institutionSettings', JSON.stringify(settings));

            renderHeader(settings);
            updateBanner(isSharedLink ? 'shared' : 'custom_firebase', data.name);
        } else renderPlaceholder();
    } catch (e) { renderPlaceholder(); }
}

function renderHeader(settings) {
    const header = document.getElementById('institutionHeader');
    const placeholder = document.getElementById('headerPlaceholder');
    const logoContainer = document.getElementById('headerLogoContainer');
    
    if(placeholder) placeholder.style.display = 'none';
    if(header) header.style.display = 'block';
    if(logoContainer) {
        logoContainer.innerHTML = '';
        if (settings.logos) {
            settings.logos.forEach(src => {
                const img = document.createElement('img');
                img.src = src;
                img.className = 'institution-logo';
                logoContainer.appendChild(img);
            });
        }
    }
    if(document.getElementById('institutionName')) document.getElementById('institutionName').textContent = settings.name;
    if(document.getElementById('institutionContact')) document.getElementById('institutionContact').textContent = settings.contact ? `Contact: ${settings.contact}` : '';
}

function renderPlaceholder() {
    if(document.getElementById('institutionHeader')) document.getElementById('institutionHeader').style.display = 'none';
    if(document.getElementById('headerPlaceholder')) document.getElementById('headerPlaceholder').style.display = 'block';
}

function openSettings() { 
    document.getElementById('settingsModal').style.display = 'block';
    const settings = JSON.parse(localStorage.getItem('institutionSettings') || '{}');
    document.getElementById('institutionNameInput').value = settings.name || '';
    document.getElementById('institutionContactInput').value = settings.contact || '';
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings(e) {
    e.preventDefault();
    const settings = {
        name: document.getElementById('institutionNameInput').value.trim(),
        contact: document.getElementById('institutionContactInput').value.trim(),
        logos: [],
        links: {}
    };
    localStorage.setItem('institutionSettings', JSON.stringify(settings));
    loadLocalSettings();
    closeSettings();
}

function openShareModal() {
    const modal = document.getElementById('shareModal');
    const qrDiv = document.getElementById('qrcode');
    const shareLink = document.getElementById('shareLink');
    const baseUrl = window.location.origin + window.location.pathname;
    const fullUrl = userInstId ? `${baseUrl}?ref=${userInstId}` : baseUrl;

    qrDiv.innerHTML = ""; 
    new QRCode(qrDiv, { text: fullUrl, width: 200, height: 200 });
    shareLink.textContent = fullUrl;
    modal.style.display = 'block';
}

function closeShareModal() {
    document.getElementById('shareModal').style.display = 'none';
}


// =========================================================
// CLINICAL HANDOVER REPORT LOGIC
// =========================================================

function updateBadgeCount() {
    const cardBadge = document.getElementById('cardBadge');
    if (!cardBadge) return; 

    let count = 0;
    for (let i = 0; i < sessionStorage.length; i++) {
        if (sessionStorage.key(i).startsWith("report_")) {
            count++;
        }
    }
    
    if (count > 0) {
        cardBadge.innerText = count + " Ready";
        cardBadge.style.display = 'inline-block';
    } else {
        cardBadge.style.display = 'none';
    }
}

function openReportModal() {
    const modal = document.getElementById('reportModal');
    if (!modal) return;
    
    const setVal = (id, key) => {
        const el = document.getElementById(id);
        if (el) el.value = sessionStorage.getItem(key) || "";
    };

    setVal('input_flacc', 'report_flacc');
    setVal('input_rass', 'report_rass');
    setVal('input_akps', 'report_akps');
    setVal('input_rug', 'report_rug');
    setVal('input_rdos', 'report_rdos');

    modal.style.display = 'flex';
}

function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
}

function copyReport() {
    const getVal = (id) => document.getElementById(id)?.value;

    let reportText = "📋 *CLINICAL HANDOVER*\n";
    reportText += "Name: \n";  
    reportText += "ID: \n";    
    reportText += "Date: " + new Date().toLocaleString('en-GB', { hour12: false }) + "\n";
    reportText += "------------------\n";
    
    const flacc = getVal('input_flacc'); if(flacc) reportText += `FLACC: ${flacc}\n`;
    const rass = getVal('input_rass');   if(rass)  reportText += `RASS: ${rass}\n`;
    const akps = getVal('input_akps');   if(akps)  reportText += `AKPS: ${akps}\n`;
    const rug = getVal('input_rug');     if(rug)   reportText += `RUG-ADL: ${rug}\n`;
    const rdos = getVal('input_rdos');   if(rdos)  reportText += `RDOS: ${rdos}\n`;

    if (!flacc && !rass && !akps && !rug && !rdos) {
        alert("No scores to copy.");
        return;
    }

    navigator.clipboard.writeText(reportText).then(() => {
        alert("Report copied! \n\nPlease paste in WhatsApp and add Name/ID.");
    });
}

// ============================================================
// [UPDATED] SEND TO GOOGLE FORM (Master Handover Link)
// ============================================================
function sendToGoogleForm() {
    // 1. Retrieve the saved links from memory
    const settings = JSON.parse(localStorage.getItem('institutionSettings') || '{}');
    const links = settings.links || {};

    // 2. Use the 'handover' link (from the new card in Admin)
    const baseUrl = links.handover || ""; 
    
    if (!baseUrl) {
        alert("Master Handover Link not set. Please contact your Institution Admin.");
        return;
    }
    
    // 3. ⚠️ IMPORTANT: UPDATE THESE NUMBERS TO MATCH YOUR GOOGLE FORM ⚠️
    // You must manually replace 'entry.XXXXXX' with the codes from your actual Google Form
    const mapping = {
        'input_flacc': 'entry.111111', 
        'input_rass':  'entry.222222',
        'input_akps':  'entry.333333',
        'input_rug':   'entry.444444',
        'input_rdos':  'entry.555555'
    };

    const params = new URLSearchParams();
    Object.keys(mapping).forEach(id => {
        const val = document.getElementById(id)?.value;
        if(val) params.append(mapping[id], val);
    });

    if(params.toString() === "" && !confirm("Form is empty. Open blank form?")) return;

    window.open(`${baseUrl}?${params.toString()}`, '_blank');
}

function clearReport() {
    if(confirm("Clear all data?")) {
        sessionStorage.clear();
        updateBadgeCount();
        closeReportModal();
        const inputs = document.querySelectorAll('.report-grid input');
        if(inputs.length > 0) {
            inputs.forEach(i => i.value = '');
        }
    }
}

// Expose functions globally
window.openReportModal = openReportModal;
window.closeReportModal = closeReportModal;
window.copyReport = copyReport;
window.sendToGoogleForm = sendToGoogleForm;
window.clearReport = clearReport;