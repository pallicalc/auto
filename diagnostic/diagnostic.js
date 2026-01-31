// --- diagnostic.js (Final Optimized & Verified) ---

const firebaseConfig = {
    apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
    authDomain: "pallicalc-eabdc.firebaseapp.com",
    projectId: "pallicalc-eabdc",
    storageBucket: "pallicalc-eabdc.firebasestorage.app",
    messagingSenderId: "347532270864",
    appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995"
};

// Initialize Firebase (Check prevents double-init errors)
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Global State
let context = { mode: 'personal', instId: null };

// --- 1. INITIALIZATION & SETUP ---
document.addEventListener('DOMContentLoaded', async () => {
    // A. Inject the Custom Footer (Matches your screenshot)
    injectStandardFooter();

    // B. Set Date
    const dateDisplay = document.getElementById('dateDisplay');
    if(dateDisplay) dateDisplay.innerText = new Date().toLocaleDateString();

    // C. Attach Score Calculator
    const form = document.getElementById('iposForm');
    if(form) form.addEventListener('change', calculateTotalScore);

    // D. Handle Institution/User Logic
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    if (ref) {
        // Shared Mode (Scanned QR)
        context.mode = 'shared'; 
        context.instId = ref;
        
        const backLink = document.getElementById('backLink');
        if (backLink) backLink.href = `../../diagnostic.html?ref=${ref}`;

        // Generate "Blank Form" QR (for sharing)
        const blankQr = document.getElementById("blank-qrcode");
        if(blankQr) new QRCode(blankQr, { text: window.location.href, width: 90, height: 90 });

        await loadInstitutionHeader();
    } else {
        // Personal/Admin Mode
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const snap = await db.collection('users').doc(user.uid).get();
                    if (snap.exists && (snap.data().role === 'institutionUser' || snap.data().role === 'institutionAdmin')) {
                        context.mode = 'institution'; 
                        context.instId = snap.data().institutionId;
                        await loadInstitutionHeader();
                    }
                } catch (e) { console.error("User Auth Error:", e); }
            }
            if (context.mode === 'personal') {
                loadPersonalHeader();
            }
        });
    }
});

// --- 2. HEADER & FOOTER INJECTION ---

function injectStandardFooter() {
    const footerHTML = `
        <footer class="standard-footer">
            <div class="footer-inner">
                <div class="print-branding" id="print-branding-container" style="display:none;">
                    <div class="print-logo-row" id="print-logo-row"></div>
                    <div class="print-info-row">
                        <strong id="print-inst-name"></strong>
                        <span id="print-inst-contact"></span>
                    </div>
                    <hr class="print-divider">
                </div>

                <div class="footer-content">
                    <p class="f-copyright">&copy; 2026 Alivioscript Solutions</p>
                    <p class="f-author">Author: Alison Chai</p>
                    <p class="f-creds">RPh (M'sia): 9093 | GPhC (UK): 2077838</p>
                    <p class="f-warning">For professional use only. Verify all results.</p>
                </div>
            </div>
        </footer>
    `;

    // Replace any existing footer
    const existing = document.querySelector('footer');
    if(existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', footerHTML);
}

// --- 3. BRANDING LOGIC (Synced with Education.js) ---

async function loadInstitutionHeader() {
    if (!context.instId) return;
    try {
        const doc = await db.collection('institutions').doc(context.instId).get();
        if (doc.exists) { 
            const data = doc.data();
            
            // Suspension Check
            if (data.status === 'suspended') {
                localStorage.removeItem('cached_inst_' + context.instId);
                localStorage.removeItem('institutionSettings');
                return; 
            }

            // Cache & Render
            localStorage.setItem('cached_inst_' + context.instId, JSON.stringify(data));
            saveSettingsToLocal(data);
            applyBranding(data); 
        }
    } catch (e) { 
        // Offline Fallback
        const cached = localStorage.getItem('cached_inst_' + context.instId);
        if (cached) applyBranding(JSON.parse(cached));
    }
}

function loadPersonalHeader() {
    const settingsStr = localStorage.getItem('institutionSettings');
    if (settingsStr) {
        try {
            const s = JSON.parse(settingsStr);
            applyBranding({ headerName: s.name, headerContact: s.contact, headerLogos: s.logos, logo: s.logo });
        } catch (e) {}
    }
}

function saveSettingsToLocal(data) {
    localStorage.setItem('institutionSettings', JSON.stringify({
        name: data.headerName || data.name,
        contact: data.headerContact || data.contact,
        logos: data.headerLogos || (data.logo ? [data.logo] : []),
        logo: data.logo
    }));
}

function applyBranding(data) {
    const name = data.headerName || data.name;
    const logos = data.headerLogos || (data.logo ? [data.logo] : []);
    const contact = data.headerContact || data.contact;
    const logoSrc = logos.length > 0 ? logos[0] : null;

    // A. Apply to Header
    if(name) document.getElementById('inst-name-display').textContent = name;
    if(contact) document.getElementById('inst-contact-display').textContent = contact;
    if(logoSrc) {
        const el = document.getElementById('inst-logo-img');
        if(el) { el.src = logoSrc; el.style.display = 'block'; }
        document.getElementById('inst-header-container').style.display = 'flex';
    }

    // B. Apply to Print Footer
    if(name) document.getElementById('print-inst-name').textContent = name;
    if(contact) document.getElementById('print-inst-contact').textContent = " | " + contact;
    
    const logoRow = document.getElementById('print-logo-row');
    if(logos.length > 0 && logoRow) {
        logoRow.innerHTML = '';
        logos.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'print-footer-logo';
            logoRow.appendChild(img);
        });
    }
}

// --- 4. FORM LOGIC (Scoring & QR) ---

function calculateTotalScore() {
    let total = 0;
    // Sum all checked radio buttons
    document.querySelectorAll('#iposForm input[type="radio"]:checked').forEach(input => {
        total += parseInt(input.value);
    });
    const display = document.getElementById('total-score-display');
    if(display) display.innerText = total;
    return total;
}

function generateQR() {
    const getVal = (name) => {
        const el = document.querySelector(`input[name="${name}"]:checked`);
        return el ? parseInt(el.value) : 0;
    };

    // Construct Payload (Matches your HTML IDs exactly)
    const payload = {
        t: "IPOS",
        d: Date.now(),
        score: calculateTotalScore(),
        q1: document.getElementById('q1_input').value.substring(0, 100),
        s: { 
            p: getVal('pain'), s: getVal('sob'), w: getVal('weak'),
            n: getVal('nau'), v: getVal('vom'), a: getVal('app'),
            c: getVal('con'), m: getVal('mou'), d: getVal('dro'),
            mb: getVal('mob')
        },
        o: { 
             l: document.getElementById('other_sym_label').value.substring(0,20),
             v: getVal('other_sym_val')
        },
        p: { 
            a: getVal('anxious'), f: getVal('family'), d: getVal('depressed'),
            pe: getVal('peace'), sh: getVal('share'), i: getVal('info'),
            pr: getVal('practical')
        },
        m: document.getElementById('completion_mode').value
    };

    // Render QR
    const qrDiv = document.getElementById("qrcode");
    qrDiv.innerHTML = "";
    new QRCode(qrDiv, { text: JSON.stringify(payload), width: 200, height: 200 });

    const section = document.getElementById('qr-section');
    section.style.display = 'block';
    section.scrollIntoView({behavior: 'smooth'});
}

function printBlankForm() {
    window.print(); 
}