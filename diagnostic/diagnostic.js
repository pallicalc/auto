// --- diagnostic.js (Synced with Education Logic) ---

const firebaseConfig = {
    apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
    authDomain: "pallicalc-eabdc.firebaseapp.com",
    projectId: "pallicalc-eabdc",
    storageBucket: "pallicalc-eabdc.firebasestorage.app",
    messagingSenderId: "347532270864",
    appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995"
};

// Initialize Firebase only once
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Global context
let context = { mode: 'personal', instId: null };

// --- 1. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    
    // Display Date
    const dateDisplay = document.getElementById('dateDisplay');
    if(dateDisplay) dateDisplay.innerText = new Date().toLocaleDateString();

    // Listeners
    const form = document.getElementById('iposForm');
    if(form) form.addEventListener('change', calculateTotalScore);

    // --- LOGIC FROM EDUCATION.JS ---
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    if (ref) {
        context.mode = 'shared'; 
        context.instId = ref;
        
        const backLink = document.getElementById('backLink');
        if (backLink) backLink.href = `../../diagnostic.html?ref=${ref}`;

        // QR for blank form
        const blankQr = document.getElementById("blank-qrcode");
        if(blankQr) new QRCode(blankQr, { text: window.location.href, width: 90, height: 90 });

        await loadInstitutionHeader();
    } else {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const snap = await db.collection('users').doc(user.uid).get();
                    if (snap.exists && (snap.data().role === 'institutionUser' || snap.data().role === 'institutionAdmin')) {
                        context.mode = 'institution'; 
                        context.instId = snap.data().institutionId;
                        await loadInstitutionHeader();
                    }
                } catch (e) {
                    console.error("User Auth Error:", e);
                }
            }
            if (context.mode === 'personal') {
                loadPersonalHeader();
            }
        });
    }
});

// --- 2. HEADER LOGIC (EXACT COPY OF EDUCATION.JS) ---

async function loadInstitutionHeader() {
    if (!context.instId) return;
    try {
        const doc = await db.collection('institutions').doc(context.instId).get();
        if (doc.exists) { 
            const data = doc.data();
            
            // 🛑 CRITICAL TWEAK: CHECK SUSPENSION STATUS
            if (data.status === 'suspended') {
                console.log("Institution suspended. Wiping branding data.");
                localStorage.removeItem('cached_inst_' + context.instId);
                localStorage.removeItem('institutionSettings');
                return; 
            }

            // --- CACHE FOR OFFLINE ---
            localStorage.setItem('cached_inst_' + context.instId, JSON.stringify(data));
            
            // Sync with general settings
            localStorage.setItem('institutionSettings', JSON.stringify({
                name: data.headerName || data.name,
                contact: data.headerContact || data.contact,
                logos: data.headerLogos || (data.logo ? [data.logo] : []),
                logo: data.logo
            }));

            renderHeader(data); 
        }
    } catch (e) { 
        console.warn("Header Fetch Error (Switching to Offline Cache):", e);
        const cached = localStorage.getItem('cached_inst_' + context.instId);
        if (cached) {
            renderHeader(JSON.parse(cached));
        } else {
            loadPersonalHeader();
        }
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
            renderHeader(data);
        } catch (e) { console.error("Local Storage Parse Error", e); }
    }
}

function renderHeader(data) {
    // 1. Render Top Header (Screen)
    const container = document.getElementById('inst-header-container');
    const nameEl = document.getElementById('inst-name-display');
    const contactEl = document.getElementById('inst-contact-display');
    const logoEl = document.getElementById('inst-logo-img');

    const name = data.headerName || data.name;
    if (name && nameEl) nameEl.textContent = name;

    const contact = data.headerContact || data.contact;
    if (contact && contactEl) contactEl.textContent = contact;
    
    const logoSrc = (data.headerLogos && data.headerLogos.length > 0) ? data.headerLogos[0] : data.logo;
    
    if (logoSrc && logoEl && container) { 
        logoEl.src = logoSrc; 
        logoEl.style.display = 'block'; 
        container.style.display = 'flex'; 
    }

    // 2. Render Print Footer (Hidden on screen, visible on PDF)
    updatePrintFooter(name, contact, data.headerLogos || [logoSrc]);
}

// Helper to populate the Print Footer
function updatePrintFooter(name, contact, logos) {
    const footerName = document.getElementById('footer-print-name');
    const footerContact = document.getElementById('footer-print-contact');
    const footerLogos = document.getElementById('footer-print-logos');

    if (footerName && name) footerName.innerText = name;
    if (footerContact && contact) footerContact.innerText = contact;

    if (footerLogos && logos && logos.length > 0) {
        footerLogos.innerHTML = '';
        logos.forEach(src => {
            if(src) {
                const img = document.createElement('img');
                img.src = src;
                img.style.height = '25px';
                img.style.marginRight = '10px';
                footerLogos.appendChild(img);
            }
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