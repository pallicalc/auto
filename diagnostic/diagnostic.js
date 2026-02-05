// ============================================================
// DIAGNOSTIC.JS - DIRECT CONSENT VERSION
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
    authDomain: "pallicalc-eabdc.firebaseapp.com",
    projectId: "pallicalc-eabdc",
    storageBucket: "pallicalc-eabdc.firebasestorage.app",
    messagingSenderId: "347532270864",
    appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = (typeof firebase !== 'undefined') ? firebase.firestore() : null;
const auth = (typeof firebase !== 'undefined') ? firebase.auth() : null;

window.appContext = { mode: 'personal', instId: null };

// --- 1. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // A. Inject the Modal HTML immediately
    injectConsentModal();
    injectStandardFooter();
    injectFavicon();

    const dateDisplay = document.getElementById('dateDisplay');
    if(dateDisplay) dateDisplay.innerText = new Date().toLocaleDateString();

    // B. Handle Auth/Roles
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    if (ref) {
        window.appContext.mode = 'shared';
        window.appContext.instId = ref;
        await setupUI(ref);
    } else {
        if(auth) {
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const snap = await db.collection('users').doc(user.uid).get();
                        if (snap.exists) {
                            const userData = snap.data();
                            if (['institutionUser', 'institutionAdmin'].includes(userData.role)) {
                                window.appContext.mode = 'institution';
                                window.appContext.instId = userData.institutionId;
                            }
                        }
                    } catch (e) { console.error(e); }
                }
                setupUI(window.appContext.instId);
            });
        } else {
            setupUI(null);
        }
    }
});

// --- 2. CONSENT LOGIC (The Formula) ---
let functionToRunAfterConsent = null;

function injectConsentModal() {
    // If modal already exists, don't create it again
    if (document.getElementById('pdpa-modal')) return;

    const modalHtml = `
    <div id="pdpa-modal" class="modal-overlay" style="display:none;">
        <div class="modal-box">
            <div class="modal-header">
                <h3>Data Consent</h3>
            </div>
            <div class="modal-body">
                <p><strong>Privacy Notice:</strong> By proceeding, you consent to generating a QR code containing your assessment responses. 
                This data is generated locally to facilitate your clinical consultation and is not permanently stored on a central server.</p>
            </div>
            <div class="modal-actions">
                <button class="btn btn-cancel" onclick="cancelConsent()">Cancel</button>
                <button class="btn btn-agree" onclick="agreeConsent()">Agree & Generate</button>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Function A: Call this from your HTML button
window.askForConsent = function(targetFunction) {
    functionToRunAfterConsent = targetFunction; // Save the QR function for later
    const modal = document.getElementById('pdpa-modal');
    if(modal) {
        modal.style.display = 'flex'; // Show the box
    } else {
        // Fallback if modal CSS/HTML failed
        if(confirm("Generate QR Code?")) targetFunction();
    }
}

// Function B: Runs when user clicks "Agree"
window.agreeConsent = function() {
    const modal = document.getElementById('pdpa-modal');
    if(modal) modal.style.display = 'none'; // Hide box
    
    if (typeof functionToRunAfterConsent === 'function') {
        functionToRunAfterConsent(); // <--- RUN THE SAVED FORMULA (QR GENERATION)
    }
    functionToRunAfterConsent = null;
}

// Function C: Runs when user clicks "Cancel"
window.cancelConsent = function() {
    const modal = document.getElementById('pdpa-modal');
    if(modal) modal.style.display = 'none';
    functionToRunAfterConsent = null;
}

// --- 3. UI HELPERS (Header/Footer) ---
async function setupUI(instId) {
    const blankQrHeader = document.getElementById('blank-qr-header');
    const backButton = document.getElementById('backLink');

    if (window.appContext.mode === 'shared') {
        if(blankQrHeader) blankQrHeader.style.display = 'none';
        if(backButton) backButton.style.display = 'none';
    } else {
        if(blankQrHeader) {
            blankQrHeader.style.display = 'block';
            generateStartQR(instId);
        }
        if(backButton) backButton.style.display = 'inline-flex';
    }

    if (instId) await loadInstitutionHeader(instId);
    else loadPersonalHeader();
}

function generateStartQR(instId) {
    const qrContainer = document.getElementById("blank-qrcode");
    if (!qrContainer) return;
    qrContainer.innerHTML = "";
    const baseUrl = window.location.href.split('?')[0];
    const targetUrl = instId ? `${baseUrl}?ref=${instId}` : baseUrl;
    new QRCode(qrContainer, { text: targetUrl, width: 100, height: 100 });
}

async function loadInstitutionHeader(instId) {
    try {
        const doc = await db.collection('institutions').doc(instId).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.status === 'suspended') return;
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

function normalizeBranding(data) {
    const logos = data.headerLogos || (data.logo ? [data.logo] : []);
    return { name: data.headerName || data.name || "", contact: data.headerContact || data.contact || "", logo: logos.length > 0 ? logos[0] : null };
}

function applyBranding({ name, contact, logo }) {
    if(name) {
        const nameEl = document.getElementById('inst-name-display');
        if(nameEl) nameEl.textContent = name;
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
    if(document.querySelector('.standard-footer')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <footer class="standard-footer" style="padding: 15px 10px; background: transparent; border-top: none; text-align:center; font-size:11px; color:#6c757d; margin-top:50px;">
            <div style="line-height: 1.4;">
                <p style="margin: 0; font-weight: bold;">&copy; 2026 Alivioscript Solutions</p>
                <p style="margin: 2px 0;">Author: Alison Chai, RPh (M'sia): 9093, GPhC (UK): 2077838</p>
                <p style="margin: 2px 0; font-weight: bold; color: #dc3545;">For professional use only.</p>
            </div>
        </footer>
    `);
}

function injectFavicon() {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = '../../favicon.png'; 
}
