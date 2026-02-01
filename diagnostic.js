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

// --- FIREBASE CONFIG (Keep your existing config) ---
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
    generateToolLinks(); // <--- THIS FUNCTION GENERATES THE FLAGS
    
    // Attach Event Listeners
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
});

// --- 1. CONFIGURATION FOR DIAGNOSTIC TOOLS ---
const toolConfig = {
    languages: { 
        en: { flag: '🇬🇧', label: 'English', filename: 'eng.html' },
        zh: { flag: '🇨🇳', label: '中文', filename: 'ch.html' },
        ms: { flag: '🇲🇾', label: 'Bahasa', filename: 'bm.html' } 
    },
    // These names MUST match the data-tool="..." in your HTML
    tools: { 
        ipos:       ['en', 'zh', 'ms'],
        hads:       ['en', 'zh', 'ms'],
        distress:   ['en', 'zh', 'ms']
    }
};

// --- 2. THE FUNCTION THAT GENERATES FLAGS ---
function generateToolLinks() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');

    // Loop through every tool in the config
    Object.entries(toolConfig.tools).forEach(([toolId, availableLangs]) => {
        
        // FIND THE CONTAINER: Look for data-tool="ipos" (not data-pamphlet)
        const section = document.querySelector(`[data-tool="${toolId}"] .language-icons`);
        
        if (!section) {
            console.warn(`Could not find container for tool: ${toolId}`);
            return;
        }

        section.innerHTML = ''; // Clear any existing content

        // Create the buttons
        availableLangs.forEach(langCode => {
            const langData = toolConfig.languages[langCode];
            const link = document.createElement('a');
            
            // Path: diagnostic/toolName/eng.html
            const baseUrl = `diagnostic/${toolId}/${langData.filename}`;
            link.href = ref ? `${baseUrl}?ref=${ref}` : baseUrl;
            link.className = 'lang-icon-link'; // Uses your style.css
            link.innerHTML = `
              <div class="lang-icon" style="font-size:24px;">${langData.flag}</div>
              <div class="lang-label" style="font-size:12px;">${langData.label}</div>
            `;
            section.appendChild(link);
        });
    });
}

// --- STANDARD APP LOGIC (Header, Firebase, etc.) ---
// (Keep the rest of your logic below for InitApp, LoadSettings, etc.)

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

async function loadInstitutionFromFirebase(instId, isSharedLink) {
    try {
        const doc = await db.collection('institutions').doc(instId).get();
        if (doc.exists) {
            const data = doc.data();
            renderHeader({
                name: data.headerName || data.name,
                contact: data.headerContact,
                logos: data.headerLogos || [] 
            });
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

// --- SETTINGS UI & SAVE ---
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
        logos: [] // Simplify for brevity, add logo logic if needed
    };
    localStorage.setItem('institutionSettings', JSON.stringify(settings));
    loadLocalSettings();
    closeSettings();
}

// --- QR CODE ---
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