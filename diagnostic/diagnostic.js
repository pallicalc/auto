// --- diagnostic.js ---

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

    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    // --- 1. PREPARE PRINT HEADER (Title + Subtitle) ---
    const blankQrHeader = document.getElementById('blank-qr-header');
    if (blankQrHeader) {
        const textContainer = document.createElement('div');
        textContainer.className = 'print-header-text';
        
        const printTitle = document.createElement('h1');
        printTitle.innerText = 'IPOS Assessment';
        printTitle.className = 'print-only-title';
        
        const printSubtitle = document.createElement('p');
        printSubtitle.innerText = 'Integrated Palliative care Outcome Scale';
        printSubtitle.className = 'print-only-subtitle';

        textContainer.appendChild(printTitle);
        textContainer.appendChild(printSubtitle);
        blankQrHeader.insertBefore(textContainer, blankQrHeader.firstChild);
    }

    // --- 2. PREPARE PRINT Q2 HEADER (Scale Labels) ---
    // This inserts the row "Not at all ... Overwhelmingly" at the top of Q2
    const q2Card = document.querySelector('.print-page-1 .question-card:nth-of-type(2)');
    if (q2Card) {
        const headerRow = document.createElement('div');
        headerRow.className = 'print-q2-header-row';
        headerRow.innerHTML = `
            <div class="p-spacer"></div> <div class="p-scale-labels">
                <span>Not at all</span>
                <span>Slightly</span>
                <span>Moderately</span>
                <span>Severely</span>
                <span>Overwhelmingly</span>
            </div>
        `;
        // Insert after the main Q2 label
        const qLabel = q2Card.querySelector('.q-label');
        if (qLabel) qLabel.parentNode.insertBefore(headerRow, qLabel.nextSibling);
    }

    if (ref) {
        context.mode = 'shared'; 
        context.instId = ref;
        
        const backLink = document.getElementById('backLink');
        if (backLink) backLink.href = `../../diagnostic.html?ref=${ref}`;

        // QR SIZE set to 100 as requested
        const blankQr = document.getElementById("blank-qrcode");
        if(blankQr) new QRCode(blankQr, { text: window.location.href, width: 100, height: 100 }); 

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
                } catch (e) { console.error("User Auth Error:", e); }
            }
            if (context.mode === 'personal') loadPersonalHeader();
        });
    }
});

// --- FOOTER INJECTION ---
function injectStandardFooter() {
    const footerHTML = `
        <footer class="standard-footer">
            <div class="footer-inner">
                <div class="print-branding" id="print-branding-container" style="display:none;">
                    <div class="print-branding-row">
                        <div class="footer-left" id="print-logo-row"></div>
                        <div class="footer-right">
                            <strong id="print-inst-name"></strong>
                            <div id="print-inst-contact"></div>
                        </div>
                    </div>
                    <div class="print-copyright-line">
                        &copy; 2026 Alivioscript Solutions | PalliCalc™
                    </div>
                </div>

                <div class="screen-footer-content">
                    <p class="f-copyright">&copy; 2026 Alivioscript Solutions</p>
                    <p class="f-author">Author: Alison Chai</p>
                    <p class="f-creds">RPh (M'sia): 9093 | GPhC (UK): 2077838</p>
                    <p class="f-warning">For professional use only. Verify all results.</p>
                </div>
            </div>
        </footer>
    `;

    const existing = document.querySelector('footer');
    if(existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', footerHTML);
}

// --- HEADER LOGIC ---
async function loadInstitutionHeader() {
    if (!context.instId) return;
    try {
        const doc = await db.collection('institutions').doc(context.instId).get();
        if (doc.exists) { 
            const data = doc.data();
            if (data.status === 'suspended') {
                localStorage.removeItem('cached_inst_' + context.instId);
                localStorage.removeItem('institutionSettings');
                return; 
            }
            localStorage.setItem('cached_inst_' + context.instId, JSON.stringify(data));
            localStorage.setItem('institutionSettings', JSON.stringify({
                name: data.headerName || data.name,
                contact: data.headerContact || data.contact,
                logos: data.headerLogos || (data.logo ? [data.logo] : []),
                logo: data.logo
            }));
            applyBranding(data); 
        }
    } catch (e) { 
        const cached = localStorage.getItem('cached_inst_' + context.instId);
        if (cached) applyBranding(JSON.parse(cached));
    }
}

function loadPersonalHeader() {
    const settingsStr = localStorage.getItem('institutionSettings');
    if (settingsStr) {
        try {
            const settings = JSON.parse(settingsStr);
            applyBranding({
                headerName: settings.name,
                headerContact: settings.contact,
                headerLogos: settings.logos || (settings.logo ? [settings.logo] : []),
                logo: settings.logo 
            });
        } catch (e) {}
    }
}

function applyBranding(data) {
    const name = data.headerName || data.name;
    const logos = data.headerLogos || (data.logo ? [data.logo] : []);
    const contact = data.headerContact || data.contact;
    const logoSrc = logos[0];

    // Screen
    if(name) document.getElementById('inst-name-display').textContent = name;
    if(contact) document.getElementById('inst-contact-display').textContent = contact;
    if(logoSrc) {
        const el = document.getElementById('inst-logo-img');
        if(el) { el.src = logoSrc; el.style.display = 'block'; }
        document.getElementById('inst-header-container').style.display = 'flex';
    }

    // Print Footer
    if(name) document.getElementById('print-inst-name').textContent = name;
    if(contact) document.getElementById('print-inst-contact').textContent = "Contact: " + contact;
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

// --- UTILITIES ---
function calculateTotalScore() {
    let total = 0;
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
    const payload = {
        t: "IPOS", d: Date.now(), score: calculateTotalScore(),
        q1: document.getElementById('q1_input').value.substring(0, 100),
        s: { 
            p: getVal('pain'), s: getVal('sob'), w: getVal('weak'),
            n: getVal('nau'), v: getVal('vom'), a: getVal('app'),
            c: getVal('con'), m: getVal('mou'), d: getVal('dro'),
            mb: getVal('mob')
        },
        o: { l: document.getElementById('other_sym_label').value.substring(0,20), v: getVal('other_sym_val') },
        p: { a: getVal('anxious'), f: getVal('family'), d: getVal('depressed'), pe: getVal('peace'), sh: getVal('share'), i: getVal('info'), pr: getVal('practical') },
        m: document.getElementById('completion_mode').value
    };
    const qrDiv = document.getElementById("qrcode");
    qrDiv.innerHTML = "";
    new QRCode(qrDiv, { text: JSON.stringify(payload), width: 200, height: 200 });
    const section = document.getElementById('qr-section');
    section.style.display = 'block';
    section.scrollIntoView({behavior: 'smooth'});
}

function printBlankForm() { window.print(); }