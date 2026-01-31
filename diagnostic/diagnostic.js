// --- diagnostic.js (Final: Role-Based Display + Back Button Logic) ---

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
    
    const dateDisplay = document.getElementById('dateDisplay');
    if(dateDisplay) dateDisplay.innerText = new Date().toLocaleDateString();

    const form = document.getElementById('iposForm');
    if(form) form.addEventListener('change', calculateTotalScore);

    // --- DETERMINE ROLE ---
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    if (ref) {
        // SCENARIO A: PATIENT (Accessed via QR Link)
        context.mode = 'shared'; 
        context.instId = ref;
        
        // EXECUTE PATIENT VIEW LOGIC
        await finalizeAppSetup(context.instId);

    } else {
        // SCENARIO B: DOCTOR (Direct Access / Login)
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const snap = await db.collection('users').doc(user.uid).get();
                    if (snap.exists) {
                        const userData = snap.data();
                        if (['institutionUser', 'institutionAdmin'].includes(userData.role)) {
                            context.mode = 'institution'; 
                            context.instId = userData.institutionId;
                        }
                    }
                } catch (e) { console.error("Auth Data Error:", e); }
            }
            // Execute Final Setup (Doctors will see QR & Back Button)
            finalizeAppSetup(context.instId);
        });
    }
});

// --- UI SETUP HANDLER ---
async function finalizeAppSetup(instId) {
    const blankQrHeader = document.getElementById('blank-qr-header');
    const backButton = document.getElementById('backLink');

    if (context.mode === 'shared') {
        // === PATIENT VIEW ===
        // 1. Hide the "Scan to Start" QR (They are already here)
        if(blankQrHeader) blankQrHeader.style.display = 'none';
        
        // 2. Hide the Back Button (Prevent accidental exit)
        if(backButton) backButton.style.display = 'none';
    
    } else {
        // === DOCTOR VIEW ===
        // 1. Generate and Show the "Scan to Start" QR
        if(blankQrHeader) {
            blankQrHeader.style.display = 'block';
            generateBlankFormQR(instId);
        }
        
        // 2. Ensure Back Button is Visible
        if(backButton) backButton.style.display = 'inline-flex';
    }

    // Load Branding
    if (instId) {
        await loadInstitutionHeader(instId);
    } else {
        loadPersonalHeader();
    }
}

// --- 1. START QR (URL LINK) ---
function generateBlankFormQR(instId) {
    const qrContainer = document.getElementById("blank-qrcode");
    if (!qrContainer) return;

    qrContainer.innerHTML = ""; 
    const baseUrl = window.location.href.split('?')[0]; 
    const targetUrl = instId ? `${baseUrl}?ref=${instId}` : baseUrl;
    
    new QRCode(qrContainer, { text: targetUrl, width: 100, height: 100 });
}

// --- 2. RESULT QR (DATA PAYLOAD) ---
function generateQR() {
    const getVal = (name) => {
        const el = document.querySelector(`input[name="${name}"]:checked`);
        return el ? parseInt(el.value) : 0;
    };

    const otherSymptoms = [];
    for (let i = 1; i <= 3; i++) {
        const labelEl = document.getElementById(`other_sym_${i}_label`);
        const label = labelEl ? labelEl.value.substring(0, 20) : "";
        const val = getVal(`other_sym_${i}_val`);
        if (label || val > 0) {
            otherSymptoms.push(`${label} (${val})`);
        }
    }

    const payload = {
        t: "IPOS",
        d: Date.now(),
        score: calculateTotalScore(),
        Q1: document.getElementById('q1_input').value.substring(0, 100),
        Q2a: getVal('pain'),
        Q2b: getVal('sob'),
        Q2c: getVal('weak'),
        Q2d: getVal('nau'),
        Q2e: getVal('vom'),
        Q2f: getVal('app'),
        Q2g: getVal('con'),
        Q2h: getVal('mou'),
        Q2i: getVal('dro'),
        Q2j: getVal('mob'),
        Q2k: otherSymptoms.join(", "), 
        Q3: getVal('anxious'),
        Q4: getVal('family'),
        Q5: getVal('depressed'),
        Q6: getVal('peace'),
        Q7: getVal('share'),
        Q8: getVal('info'),
        Q9: getVal('practical'),
        Q10: document.getElementById('completion_mode').value
    };

    const qrDiv = document.getElementById("qrcode");
    qrDiv.innerHTML = "";
    
    const safeData = encodeURIComponent(JSON.stringify(payload));
    new QRCode(qrDiv, { text: safeData, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.L });

    const section = document.getElementById('qr-section');
    section.style.display = 'block';
    section.scrollIntoView({behavior: 'smooth'});
}

// --- UTILS ---
function calculateTotalScore() {
    let total = 0;
    document.querySelectorAll('#iposForm input[type="radio"]:checked').forEach(input => {
        total += parseInt(input.value);
    });
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
            if (data.status === 'suspended') { localStorage.removeItem('institutionSettings'); return; }
            const cleanData = normalizeBranding(data);
            localStorage.setItem('institutionSettings', JSON.stringify(cleanData));
            applyBranding(cleanData); 
        }
    } catch (e) { loadPersonalHeader(); }
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
                <p style="margin: 2px 0; font-weight: bold; color: #dc3545;">For professional use only. Verify all results.</p>
            </div>
        </footer>
    `);
}

function printPDF() { window.print(); }