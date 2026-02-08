// --- Auto-Inject Favicon into Header ---
(function() {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = '../../favicon.png';

})();
// --- FIREBASE CONFIG ---
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

async function initApp() {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    try {
        await db.enablePersistence({ synchronizeTabs: true });
        console.log("🔥 Firestore Offline Persistence Enabled");
    } catch (err) {
        if (err.code == 'failed-precondition') {
            console.warn("Persistence failed: Multiple tabs open.");
        } else if (err.code == 'unimplemented') {
            console.warn("Persistence failed: Browser not supported.");
        }
    }

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const snap = await db.collection('users').doc(user.uid).get();
                if (snap.exists) {
                    const data = snap.data();
                    currentUserRole = data.role || "personal";
                    userInstId = data.institutionId || null;
                }
            } catch (e) { console.error(e); }
        } else {
            currentUserRole = "guest";
        }
        applyViewLogic();
    });
}

async function applyViewLogic() {
    const settingsSection = document.getElementById('settingsCallout');
    const shareSection = document.getElementById('shareCallout');
    
    // 1. PUBLIC VIEW: Check URL for ?ref= (Shared Link)
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRef = urlParams.get('ref');

    if (sharedRef) {
        settingsSection.style.display = 'none';
        shareSection.style.display = 'none';
        await loadInstitutionFromFirebase(sharedRef, true);
        return;
    }

    // 2. INSTITUTION STAFF VIEW
    if ((currentUserRole === 'institutionUser' || currentUserRole === 'institutionAdmin') && userInstId) {
        await loadInstitutionFromFirebase(userInstId, false);
        settingsSection.style.display = 'none';
        shareSection.style.display = 'block';
    } 
    // 3. PERSONAL/GUEST VIEW
    else {
        settingsSection.style.display = 'block';
        shareSection.style.display = 'block'; 
        loadLocalSettings();
    }
}

function updateBanner(type, sourceName) {
    const banner = document.getElementById('sourceBanner');
    banner.style.display = 'block';
    
    if (type === 'shared') {
        banner.innerHTML = `<strong>Viewing Shared Page:</strong> <span class="source-shared">${sourceName}</span>`;
    } else if (type === 'custom_firebase') {
        banner.innerHTML = `<strong>${sourceName}:</strong> <span class="source-custom">Official Header Loaded</span>`;
    } else if (type === 'custom_local') {
        banner.innerHTML = `<strong>Personal User:</strong> <span class="source-custom">Custom Header (Local)</span>`;
    } else if (type === 'default_institution') {
         banner.innerHTML = `<strong>${sourceName}:</strong> <span class="source-default">Default Header (Not configured by Admin)</span>`;
    } else {
        banner.style.display = 'none';
    }
}

// --- DATA LOADING ---
function loadLocalSettings() {
    const settings = JSON.parse(localStorage.getItem('institutionSettings') || '{}');
    if (settings.name && settings.contact) {
        renderHeader(settings);
        updateBanner('custom_local');
    } else {
        renderPlaceholder();
    }
}

async function loadInstitutionFromFirebase(instId, isSharedLink) {
    try {
        const doc = await db.collection('institutions').doc(instId).get();
        if (doc.exists) {
            const data = doc.data();
            const displayHeader = data.headerName || data.name;
            
            if (displayHeader) {
                renderHeader({
                    name: displayHeader,
                    contact: data.headerContact,
                    logos: data.headerLogos || [] 
                });
                updateBanner(isSharedLink ? 'shared' : 'custom_firebase', data.name);
            } else {
                renderPlaceholder();
                if (!isSharedLink) updateBanner('default_institution', data.name);
            }
        } else {
            renderPlaceholder();
        }
    } catch (e) {
        console.error(e);
        renderPlaceholder();
    }
}

function renderHeader(settings) {
    const header = document.getElementById('institutionHeader');
    const placeholder = document.getElementById('headerPlaceholder');
    const logoContainer = document.getElementById('headerLogoContainer');
    
    placeholder.style.display = 'none';
    header.style.display = 'block';
    logoContainer.innerHTML = '';
    
    if (settings.logos && settings.logos.length > 0) {
        settings.logos.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.className = 'institution-logo';
            logoContainer.appendChild(img);
        });
    }
    document.getElementById('institutionName').textContent = settings.name;
    document.getElementById('institutionContact').textContent = settings.contact ? `Contact: ${settings.contact}` : '';
}

function renderPlaceholder() {
    document.getElementById('institutionHeader').style.display = 'none';
    document.getElementById('headerPlaceholder').style.display = 'block';
}

// --- PAMPHLET CONFIG ---
const pamphletConfig = {
    languages: { 
        en: { flag: '🇬🇧', label: 'English', filename: 'eng.html' },
        zh: { flag: '🇨🇳', label: '中文', filename: 'ch.html' },
        ms: { flag: '🇲🇾', label: 'Bahasa', filename: 'bm.html' } 
    },
    pamphlets: { 
        opioids:        ['en', 'zh', 'ms'],
        EOL:            ['en', 'zh', 'ms'],
        seizure:        ['en', 'zh', 'ms'],
        bleeding:       ['en', 'zh', 'ms'],
        breathlessness: ['en', 'zh', 'ms'],
        delirium:       ['en', 'zh', 'ms'],
        mbo:            ['en', 'zh', 'ms'],
        pain:           ['en', 'zh', 'ms'],
        buccal:         ['en', 'zh', 'ms'],
        subcutaneous:   ['en', 'zh', 'ms'],
        'td-fentanyl':  ['en', 'zh', 'ms'],
        'facing-EOL':   ['en', 'zh', 'ms']
    }
};

const preAddedLogos = [
    { id: 'palli', src: 'icon-512.png', label: 'PalliCalc' },
    { id: 'kkm', src: 'kkm-logo.png', label: 'KKM' },
    { id: 'pc', src: 'pc-logo.png', label: 'PC' }
];

let currentSelectedLogos = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    generatePamphletIcons();
    renderGallery();
    
    // Attach Event Listeners
    document.getElementById('openSettingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
    document.getElementById('openShareBtn').addEventListener('click', openShareModal);
    document.getElementById('closeShareBtn').addEventListener('click', closeShareModal);
    
    // Logo Upload Listeners
    document.getElementById('uploadTrigger').addEventListener('click', () => {
        if (currentSelectedLogos.length >= 2) return alert("Max 2 logos.");
        document.getElementById('logoFileInput').click();
    });
    
    document.getElementById('logoFileInput').addEventListener('change', (e) => {
        if(e.target.files[0]) {
            const reader = new FileReader();
            reader.readAsDataURL(e.target.files[0]);
            reader.onload = ev => {
                const img = new Image(); img.src = ev.target.result;
                img.onload = () => compressImageToDataUrl(img, 400, 0.7, (b64) => {
                    currentSelectedLogos.push(b64); updateLogoUI();
                });
            };
        }
    });

    document.getElementById('institutionForm').addEventListener('submit', saveSettings);
});

// --- QR GENERATION ---
function openShareModal() {
// --- START TRACKING CODE ---
if (typeof gtag === 'function') {
    gtag('event', 'patient_action', {
        'event_category': 'Patient Education',
        'event_label': 'generated_qr_code',
        'institution_id': userInstId || 'personal_user' 
    });
}
// --- END TRACKING CODE ---
  const modal = document.getElementById('shareModal');
    const qrDiv = document.getElementById('qrcode');
    const shareLink = document.getElementById('shareLink');
    
    const baseUrl = window.location.origin + window.location.pathname;
    const fullUrl = userInstId ? `${baseUrl}?ref=${userInstId}` : baseUrl;

    qrDiv.innerHTML = ""; 
    new QRCode(qrDiv, {
        text: fullUrl,
        width: 200,
        height: 200,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    shareLink.textContent = fullUrl;
    modal.style.display = 'block';
}

function closeShareModal() {
    document.getElementById('shareModal').style.display = 'none';
}

// --- SETTINGS UI ---
function openSettings() { 
    document.getElementById('settingsModal').style.display = 'block';
    const settings = JSON.parse(localStorage.getItem('institutionSettings') || '{}');
    document.getElementById('institutionNameInput').value = settings.name || '';
    document.getElementById('institutionContactInput').value = settings.contact || '';
    currentSelectedLogos = settings.logos || [];
    updateLogoUI();
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
    document.getElementById('passwordError').style.display = 'none';
}

// --- LOGO HANDLING ---
function renderGallery() {
    const gallery = document.getElementById('logoGallery');
    gallery.innerHTML = '';
    preAddedLogos.forEach(logo => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.innerHTML = `<img src="${logo.src}" onerror="this.style.display='none'">`;
        div.onclick = () => selectGalleryLogo(logo.src);
        gallery.appendChild(div);
    });
}

function selectGalleryLogo(src) {
    if (currentSelectedLogos.length >= 2) return alert("Max 2 logos.");
    const img = new Image(); 
    img.crossOrigin = "Anonymous"; 
    img.src = src;
    img.onload = function() {
        compressImageToDataUrl(img, 400, 0.7, (base64) => {
            currentSelectedLogos.push(base64);
            updateLogoUI();
        });
    };
    img.onerror = () => alert("Could not load logo.");
}

function updateLogoUI() {
    const container = document.getElementById('selectedLogosPreview');
    container.innerHTML = currentSelectedLogos.length === 0 ? '<span style="color:#999; font-size:12px;">No logos selected</span>' : '';
    currentSelectedLogos.forEach((src, index) => {
        const chip = document.createElement('div');
        chip.className = 'preview-chip';
        chip.innerHTML = `<img src="${src}"><button class="remove-chip" type="button" onclick="removeLogo(${index})"><i class="bi bi-trash"></i></button>`;
        container.appendChild(chip);
    });
}

// Helper to remove logo from array (needs to be global or attached to window)
window.removeLogo = function(index) {
    currentSelectedLogos.splice(index, 1);
    updateLogoUI();
};

function compressImageToDataUrl(imgObj, maxWidth, quality, callback) {
    let w = imgObj.width, h = imgObj.height;
    if (w > h) { if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; } } 
    else { if (h > maxWidth) { w *= maxWidth / h; h = maxWidth; } }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(imgObj, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
}

// --- SAVE SETTINGS ---
function saveSettings(e) {
    e.preventDefault();
    const pwd = document.getElementById('loginPassword').value;
    const savedPwd = localStorage.getItem('palliCalcLoginPassword');
    
    if (savedPwd && pwd !== savedPwd) {
        document.getElementById('passwordError').style.display = 'block';
        return;
    }
    
    const settings = {
        name: document.getElementById('institutionNameInput').value.trim(),
        contact: document.getElementById('institutionContactInput').value.trim(),
        logos: currentSelectedLogos
    };
    localStorage.setItem('institutionSettings', JSON.stringify(settings));
    loadLocalSettings();
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = '✅ Saved!';
    setTimeout(() => { closeSettings(); saveBtn.textContent = '💾 Save Settings'; }, 1000);
}

// --- LINK GENERATION ---
function generatePamphletIcons() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');

    Object.entries(pamphletConfig.pamphlets).forEach(([topicId, availableLangs]) => {
        const section = document.querySelector(`[data-pamphlet="${topicId}"] .language-icons`);
        if (!section) return;

        section.innerHTML = '';
        availableLangs.forEach(langCode => {
            const langData = pamphletConfig.languages[langCode];
            const link = document.createElement('a');
            const baseUrl = `education/${topicId}/${langData.filename}`;
            link.href = ref ? `${baseUrl}?ref=${ref}` : baseUrl;
            link.className = 'lang-icon-link';
            link.innerHTML = `
              <div class="lang-icon">${langData.flag}</div>
              <div class="lang-label">${langData.label}</div>
            `;
            section.appendChild(link);
        });
    });
}

// Close modals on outside click
window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.style.display = 'none';
    }
};