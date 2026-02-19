// ==========================================
// 2. SMART FAVICON INJECTOR
// ==========================================
(function() {
    const version = '?v=2'; 

    const icons = [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' + version },
        { rel: 'mask-icon', href: '/favicon.svg' + version, color: '#5AAB8B' },
        { rel: 'apple-touch-icon', href: '/icon-192.png' + version } // <-- Changed to icon-192.png!
    ];

    icons.forEach(iconDef => {
        let existingLink = document.querySelector(`link[rel='${iconDef.rel}']`);
        if (existingLink) existingLink.remove();

        let link = document.createElement('link');
        link.rel = iconDef.rel;
        link.href = iconDef.href;
        if (iconDef.type) link.type = iconDef.type;
        if (iconDef.color) link.setAttribute('color', iconDef.color);
        document.head.appendChild(link);
    });
})();


// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
    authDomain: "pallicalc-eabdc.firebaseapp.com",
    projectId: "pallicalc-eabdc",
    storageBucket: "pallicalc-eabdc.firebasestorage.app",
    messagingSenderId: "347532270864",
    appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let context = { mode: 'personal', instId: null };

document.addEventListener('DOMContentLoaded', async () => {
    injectStandardFooter();
    injectConsentModal(); 
    
    const dateDisplay = document.getElementById('dateDisplay');
    if(dateDisplay) dateDisplay.innerText = new Date().toLocaleDateString();

    const form = document.querySelector('form'); 
    if(form) form.addEventListener('change', calculateTotalScore);

    // --- DETERMINE ROLE ---
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    if (ref) {
        context.mode = 'shared'; 
        context.instId = ref;
        window.context = context;
        await finalizeAppSetup(context.instId);
    } else {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const snap = await db.collection('users').doc(user.uid).get();
                    if (snap.exists) {
                        const userData = snap.data();
                        if (['institutionUser', 'institutionAdmin'].includes(userData.role)) {
                            context.mode = 'institution'; 
                            context.instId = userData.institutionId;
                            window.context = context; 
                        }
                    }
                } catch (e) { console.error("Auth Data Error:", e); }
            }
            finalizeAppSetup(context.instId);
        });
    }
});

async function finalizeAppSetup(instId) {
    const blankQrHeader = document.getElementById('blank-qr-header');
    const backButton = document.getElementById('backLink');

    if (context.mode === 'shared') {
        if(blankQrHeader) blankQrHeader.style.display = 'none';
        if(backButton) backButton.style.display = 'none';
    } else {
        if(blankQrHeader) {
            blankQrHeader.style.display = 'block';
            generateBlankFormQR(instId);
        }
        if(backButton) backButton.style.display = 'inline-flex';
    }

    if (instId) {
        await loadInstitutionHeader(instId);
    } else {
        loadPersonalHeader();
    }
}

function generateBlankFormQR(instId) {
    const qrContainer = document.getElementById("blank-qrcode");
    if (!qrContainer) return;
    qrContainer.innerHTML = ""; 
    const baseUrl = window.location.href.split('?')[0]; 
    const targetUrl = instId ? `${baseUrl}?ref=${instId}` : baseUrl;
    new QRCode(qrContainer, { text: targetUrl, width: 100, height: 100 });
}

// --- RESULT GENERATION LOGIC ---

function generateQR() {
    // --- TRACKING ---
    if (typeof window.trackEvent === 'function') {
        const toolName = (typeof REPORT_KEY !== 'undefined') ? REPORT_KEY.replace('report_', '').toUpperCase() : "TOOL";
        window.trackEvent('clinical_use', {
            'event_category': 'Diagnostic Tool',
            'event_label': toolName, // Tracks WHICH tool (AKPS, ESAS, etc.)
            'institution_id': (context && context.instId) ? context.instId : 'personal_user'
        });
    }
    // ----------------

    const modal = document.getElementById('pdpa-modal');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        if(confirm("Generate QR Code? By clicking OK you consent to sharing this data for clinical use.")) {
            executeQRGeneration();
        }
    }
}

function executeQRGeneration() {
    const totalScore = calculateTotalScore();

    const getVal = (name) => {
        const el = document.querySelector(`input[name="${name}"]:checked`);
        return el ? parseInt(el.value) : 0;
    };
    
    // Generic symptom collector
    const otherSymptoms = [];
    for (let i = 1; i <= 3; i++) {
        const labelEl = document.getElementById(`other_sym_${i}_label`);
        if(labelEl) {
            const label = labelEl.value.substring(0, 20);
            const val = getVal(`other_sym_${i}_val`); // <--- FIXED THIS LINE
            if (label || val > 0) otherSymptoms.push(`${label} (${val})`);
        }
    }

    // Default Payload
    const toolName = (typeof REPORT_KEY !== 'undefined') ? REPORT_KEY.replace('report_', '').toUpperCase() : "TOOL";
    
    const payload = {
        t: toolName,
        d: Date.now(),
        score: totalScore,
        details: otherSymptoms.join(", ") 
    };

    // ============================================================
    // [SMART SAVE LOGIC]
    // Saves score to SessionStorage for the Handover Report
    // ============================================================
    if (typeof ENABLE_CLINICAL_REPORT !== 'undefined' && ENABLE_CLINICAL_REPORT === true) {
        try {
            // Safety: If this is SPICT, do NOT overwrite the text report with a number.
            // SPICT uses its own internal save logic in spict.html
            if (typeof REPORT_KEY !== 'undefined' && !REPORT_KEY.includes('spict')) {
                let formattedScore = totalScore;
                
                if(REPORT_KEY.includes('flacc')) formattedScore += "/10";
                if(REPORT_KEY.includes('akps')) formattedScore += "%";
                if(REPORT_KEY.includes('rug')) formattedScore += ""; // RUG is just a number
                
                sessionStorage.setItem(REPORT_KEY, formattedScore);
            }
        } catch (e) {
            console.warn("Session storage save failed", e);
        }
    }
    // ============================================================

    const qrDiv = document.getElementById("qrcode");
    if (qrDiv) {
        qrDiv.innerHTML = "";
        
        // 1. Get Base URL (e.g. https://pallicalc.web.app/diagnostic/scan.html)
        // We go up one level from the current diagnostic tool to find scan.html
        const baseUrl = window.location.origin + "/diagnostic/scan.html";
        
        // 2. Encode the payload safely
        const safeData = encodeURIComponent(JSON.stringify(payload));
        
        // 3. Construct the Full URL
        const fullUrl = `${baseUrl}?data=${safeData}`;
        
        // 4. Generate QR
        new QRCode(qrDiv, { text: fullUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.L });
    }

    const section = document.getElementById('qr-section');
    if (section) {
        section.style.display = 'block';
        section.scrollIntoView({behavior: 'smooth'});
    }
}

// --- UTILS ---
function calculateTotalScore() {
    let total = 0;
    const form = document.querySelector('form');
    if(form) {
        form.querySelectorAll('input[type="radio"]:checked').forEach(input => {
            const val = parseInt(input.value);
            if(!isNaN(val)) total += val;
        });
    }
    const display = document.getElementById('total-score-display');
    if(display) display.innerText = total;
    return total;
}

function normalizeBranding(data) {
    const logos = data.headerLogos || (data.logo ? [data.logo] : []);
    return {
        name: data.headerName || data.name || "",
        contact: data.headerContact || data.contact || "",
        logo: logos.length > 0 ? logos[0] : null
    };
}

async function loadInstitutionHeader(instId) {
    try {
        const doc = await db.collection('institutions').doc(instId).get();
        if (doc.exists) { 
            const data = doc.data();
            if (data.status === 'suspended') { 
                localStorage.removeItem('institutionSettings'); 
                localStorage.removeItem('cached_inst_' + instId);
                return; 
            }
            localStorage.setItem('cached_inst_' + instId, JSON.stringify(data));
            const cleanData = normalizeBranding(data);
            localStorage.setItem('institutionSettings', JSON.stringify(cleanData));
            applyBranding(cleanData); 
        }
    } catch (e) { 
        const cached = localStorage.getItem('cached_inst_' + instId);
        if (cached) {
            const data = JSON.parse(cached);
            const cleanData = normalizeBranding(data);
            applyBranding(cleanData);
        } else {
            loadPersonalHeader(); 
        }
    }
}

function loadPersonalHeader() {
    const settingsStr = localStorage.getItem('institutionSettings');
    if (settingsStr) { try { applyBranding(JSON.parse(settingsStr)); } catch (e) {} }
}

function applyBranding({ name, contact, logo }) {
    if(name) {
        const nameEl = document.getElementById('inst-name-display');
        const footerName = document.getElementById('footer-inst-name');
        if(nameEl) nameEl.textContent = name;
        if(footerName) footerName.textContent = name;
    }
    if(contact) document.getElementById('inst-contact-display').textContent = contact;
    if(logo) {
        const el = document.getElementById('inst-logo-img');
        const container = document.getElementById('inst-header-container');
        if(el) { el.src = logo; el.style.display = 'block'; }
        if(container) container.style.display = 'flex';
    }
}

function injectStandardFooter() {
    const existing = document.querySelector('footer');
    if(existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', `
        <footer class="standard-footer" style="padding: 15px 10px; background: transparent; border-top: none;">
            <div class="footer-inner" style="line-height: 1.4;">
                <p style="margin: 0; font-weight: bold; color: #495057;">&copy; 2026 Alivioscript Solutions</p>
                <p style="margin: 2px 0; color: #6c757d;">Author: Alison Chai, RPh (M'sia): 9093, GPhC (UK): 2077838</p>
                <p style="margin: 2px 0; font-weight: bold; color: #dc3545;">For Educational Use Only. Not a Medical Device. Verify all results.</p>
            </div>
        </footer>
    `);
}

function printPDF() { window.print(); }

function injectConsentModal() {
    if (document.getElementById('pdpa-modal')) return;

    const modalHtml = `
    <div id="pdpa-modal" class="modal-overlay">
        <div class="modal-box">
            <div class="modal-header">
                <h3>Data Consent</h3>
            </div>
            <div class="modal-body">
                <p>
                    <strong>Privacy Notice:</strong> By proceeding, you consent to generating a QR code containing your assessment responses. 
                    This data is generated locally to facilitate your clinical consultation and is not permanently stored on a central server.
                </p>
            </div>
            <div class="modal-actions">
                <button class="btn btn-cancel" onclick="closeConsentModal()">Cancel</button>
                <button class="btn btn-agree" onclick="confirmConsent()">Agree & Generate</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeConsentModal() {
    document.getElementById('pdpa-modal').style.display = 'none';
}

function confirmConsent() {
    closeConsentModal();
    executeQRGeneration(); 
}