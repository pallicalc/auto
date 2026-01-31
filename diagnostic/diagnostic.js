// --- diagnostic.js (Unified with Education Logic) ---

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

// Global context
let context = { mode: 'personal', instId: null };

// --- 1. INITIALIZATION & HEADER/FOOTER ---
document.addEventListener('DOMContentLoaded', async () => {
    // A. INJECT FOOTER (Matches Education HTML + PDF Branding)
    injectStandardFooter();

    // B. HANDLE URL PARAMS & AUTH
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    // Display Date
    const dateDisplay = document.getElementById('dateDisplay');
    if(dateDisplay) dateDisplay.innerText = new Date().toLocaleDateString();

    // Listeners
    const form = document.getElementById('iposForm');
    if(form) form.addEventListener('change', calculateTotalScore);

    // C. LOAD INSTITUTION DATA
    if (ref) {
        context.mode = 'shared'; 
        context.instId = ref;
        
        const backLink = document.getElementById('backLink');
        if (backLink) backLink.href = `../../diagnostic.html?ref=${ref}`;
        
        // Generate QR for blank form
        const blankQr = document.getElementById("blank-qrcode");
        if(blankQr) {
            new QRCode(blankQr, { text: window.location.href, width: 90, height: 90 });
        }

        await loadInstitutionHeader();
    } else {
        // Fallback for personal/admin usage
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

// --- 2. HEADER & FOOTER LOGIC (COPIED FROM EDUCATION.JS) ---

function injectStandardFooter() {
    // 1. Base Footer (Author + Disclaimer)
    const baseFooterHTML = `
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

                <p style="margin: 0 0 5px; font-weight: bold; color: #343a40;">&copy; 2026 Alivioscript Solutions</p>
                <div class="author-info">
                    Author: Alison Chai, RPh (M'sia): 9093, GPhC (UK): 2077838
                </div>
                <div class="footer-disclaimer">
                    <strong>Disclaimer:</strong> This tool is for professional clinical use.
                </div>
            </div>
        </footer>
    `;
    
    // Remove existing footer if any
    const existing = document.querySelector('footer');
    if(existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', baseFooterHTML);
}

async function loadInstitutionHeader() {
    if (!context.instId) return;
    try {
        const doc = await db.collection('institutions').doc(context.instId).get();
        if (doc.exists) { 
            const data = doc.data();
            
            // 🛑 SUSPENSION CHECK
            if (data.status === 'suspended') {
                console.log("Institution suspended. Wiping branding data.");
                localStorage.removeItem('cached_inst_' + context.instId);
                localStorage.removeItem('institutionSettings');
                return; 
            }

            // Cache Data
            localStorage.setItem('cached_inst_' + context.instId, JSON.stringify(data));
            
            // Sync Settings
            localStorage.setItem('institutionSettings', JSON.stringify({
                name: data.headerName || data.name,
                contact: data.headerContact || data.contact,
                logos: data.headerLogos || (data.logo ? [data.logo] : []),
                logo: data.logo
            }));

            applyBranding(data); 
        }
    } catch (e) { 
        console.warn("Header Fetch Error (Offline):", e);
        const cached = localStorage.getItem('cached_inst_' + context.instId);
        if (cached) applyBranding(JSON.parse(cached));
    }
}

function loadPersonalHeader() {
    const settingsStr = localStorage.getItem('institutionSettings');
    if (settingsStr) {
        try {
            const settings = JSON.parse(settingsStr);
            const data = {
                headerName: settings.name,
                headerContact: settings.contact,
                headerLogos: settings.logos || (settings.logo ? [settings.logo] : []),
                logo: settings.logo 
            };
            applyBranding(data);
        } catch (e) { console.error("Local Storage Parse Error", e); }
    }
}

function applyBranding(data) {
    const name = data.headerName || data.name;
    const logo = (data.headerLogos && data.headerLogos[0]) || data.logo;
    const logos = data.headerLogos || (data.logo ? [data.logo] : []);
    const contact = data.headerContact || data.contact;

    // 1. Apply to Header
    if(name) {
        document.getElementById('inst-name-display').textContent = name;
    }
    if(contact) document.getElementById('inst-contact-display').textContent = contact;
    if(logo) {
        document.getElementById('inst-logo-img').src = logo;
        document.getElementById('inst-logo-img').style.display = 'block';
        document.getElementById('inst-header-container').style.display = 'flex';
    }

    // 2. Apply to Print Footer (The "PDF Footer" Requirement)
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

// --- 3. SCORING & UTILITIES ---
function calculateTotalScore() {
    let total = 0;
    const checkedInputs = document.querySelectorAll('#iposForm input[type="radio"]:checked');
    checkedInputs.forEach(input => {
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