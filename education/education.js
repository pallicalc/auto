// ==========================================
// PalliCalc Education Script - Final Unified Version
// Includes: Suspension Logic, Race Condition Fix, Safari Crash Fix & Branding Footer
// ==========================================

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


// --- 1. FIREBASE CONFIGURATION ---
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

// Global context to store current mode (institution/personal) and ID
let context = { mode: 'personal', instId: null };

// --- 2. INITIALIZATION & HEADER LOGIC ---
window.addEventListener('DOMContentLoaded', async () => {
    // A. INJECT STANDARDIZED FOOTER FIRST
    injectStandardFooter();

    // B. HANDLE URL PARAMS & AUTH
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');

    if (ref) {
        context.mode = 'shared'; 
        context.instId = ref;
        const backBtn = document.getElementById('backBtn');
        if (backBtn) backBtn.style.display = 'none';
        loadInstitutionHeader();
    } else {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const snap = await db.collection('users').doc(user.uid).get();
                    if (snap.exists && (snap.data().role === 'institutionUser' || snap.data().role === 'institutionAdmin')) {
                        context.mode = 'institution'; 
                        context.instId = snap.data().institutionId;
                        loadInstitutionHeader();
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

// --- INJECT STANDARDIZED FOOTER ---
function injectStandardFooter() {
    const footerHTML = `
        <footer class="standard-footer">
            <div class="footer-inner">
                <p style="margin: 0 0 5px; font-weight: bold; color: #343a40;">&copy; 2026 Alivioscript Solutions</p>
                <p style="margin: 0 0 10px; color: #495057;">
                    Author: Alison Chai, RPh (M'sia): 9093, GPhC (UK): 2077838
                </p>
                <div class="footer-disclaimer">
                    <strong>Disclaimer:</strong> This information is for educational purposes only and does not replace professional medical advice. Always consult your doctor or pharmacist for specific health concerns.
                </div>
            </div>
        </footer>
    `;
    document.body.insertAdjacentHTML('beforeend', footerHTML);
}

// --- EXISTING HEADER LOGIC (UPDATED WITH SUSPENSION CHECK) ---
async function loadInstitutionHeader() {
    if (!context.instId) return;
    try {
        const doc = await db.collection('institutions').doc(context.instId).get();
        if (doc.exists) { 
            const data = doc.data();

            // 🛑 CRITICAL TWEAK: CHECK SUSPENSION STATUS
            if (data.status === 'suspended') {
                // console.log("Institution suspended. Wiping branding data.");
                // Wipe local cache so it doesn't show up offline later
                localStorage.removeItem('cached_inst_' + context.instId);
                localStorage.removeItem('institutionSettings');
                // Return immediately so NO branding is rendered. Patient sees generic page.
                return; 
            }

            // --- CACHE FOR OFFLINE (Only if Active) ---
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
        // Fallback to cache ONLY if fetch fails (e.g. offline)
        // If fetch failed due to permissions (Suspended), this might trigger.
        // But app.js usually clears cache on login, so this is a safety net.
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
}

// --- 3. FOOTER DATA FETCHING (FOR PDF) ---
async function getFooterData() {
    let data = null;
    if (context.instId) {
        try {
            const doc = await db.collection('institutions').doc(context.instId).get();
            if (doc.exists) {
                const firebaseData = doc.data();

                // 🛑 PDF SECURITY: If Suspended, Return Generic Data
                if (firebaseData.status === 'suspended') {
                    // console.log("Institution suspended. Generating generic PDF.");
                    return {
                        name: "PalliCalc Patient Education",
                        contact: "",
                        logos: [] 
                    };
                }

                data = {
                    name: firebaseData.headerName || firebaseData.name,
                    contact: firebaseData.headerContact || firebaseData.contact,
                    logos: firebaseData.headerLogos || (firebaseData.logo ? [firebaseData.logo] : [])
                };
                localStorage.setItem('cached_inst_' + context.instId, JSON.stringify(firebaseData));
            }
        } catch (e) { 
            console.warn("Footer: Firebase fetch failed, trying local...", e); 
            const cached = localStorage.getItem('cached_inst_' + context.instId);
            if (cached) {
                const c = JSON.parse(cached);
                data = {
                    name: c.headerName || c.name,
                    contact: c.headerContact || c.contact,
                    logos: c.headerLogos || (c.logo ? [c.logo] : [])
                };
            }
        }
    }

    if (!data) {
        const settingsStr = localStorage.getItem('institutionSettings');
        if (settingsStr) {
            try {
                const s = JSON.parse(settingsStr);
                data = {
                    name: s.name,
                    contact: s.contact,
                    logos: s.logos || (s.logo ? [s.logo] : [])
                };
            } catch (e) {
                console.error("Footer: LocalStorage parse error", e);
            }
        }
    }

    if (!data) {
        data = {
            name: "PalliCalc Patient Education",
            contact: "",
            logos: [] 
        };
    }
    return data;
}

// --- 4. PDF HELPER: IMAGE LOADER ---
function loadImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; 
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

// --- 5. PDF GENERATION (SAFARI OPTIMIZED + BRANDING FOOTER) ---
async function generateAndPrintPDF(filename) {
    const loading = document.getElementById('pdf-loading');
    if (loading) loading.style.display = 'flex';

    if (!filename) filename = "patient-education.pdf";

    try {
        const footerData = await getFooterData();
        const footerName = footerData.name;
        const footerContact = footerData.contact ? `Contact: ${footerData.contact}` : "";
        const footerLogos = footerData.logos;

        const element = document.getElementById('print-area');
        await new Promise(r => setTimeout(r, 200));

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const pixelRatio = window.devicePixelRatio || 1;
        const safeScale = isMobile ? (2 / pixelRatio) : 2;

        const canvas = await html2canvas(element, { 
            scale: safeScale, 
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#ffffff",
            logging: false
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.8);

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4'); 

        const A4_W = 210; 
        const A4_H = 297; 
        const FOOTER_H = 25; 
        const CONTENT_H = A4_H - FOOTER_H; 

        const imgRatio = canvas.width / canvas.height;
        const contentRatio = A4_W / CONTENT_H;

        let finalImgW, finalImgH;
        if (imgRatio > contentRatio) {
            finalImgW = A4_W;
            finalImgH = A4_W / imgRatio;
        } else {
            finalImgH = CONTENT_H;
            finalImgW = CONTENT_H * imgRatio;
        }

        const xOffset = (A4_W - finalImgW) / 2;
        pdf.addImage(imgData, 'JPEG', xOffset, 0, finalImgW, finalImgH);

        const lineY = A4_H - FOOTER_H;
        pdf.setDrawColor(200); 
        pdf.line(10, lineY, 200, lineY);

        pdf.setTextColor(50);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.text(footerName, 200, lineY + 8, { align: "right" });

        if (footerContact) {
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(100);
            pdf.text(footerContact, 200, lineY + 13, { align: "right" });
        }

        if (footerLogos && footerLogos.length > 0) {
            let currentX = 10; 
            for (const logoSrc of footerLogos) {
                const logoImg = await loadImage(logoSrc);
                if (logoImg) {
                    const maxLogoH = 15;
                    const maxLogoW = 40;
                    const scale = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height);
                    const finalW = logoImg.width * scale;
                    const finalH = logoImg.height * scale;
                    pdf.addImage(logoImg, 'PNG', currentX, lineY + 4, finalW, finalH);
                    currentX += finalW + 5;
                }
            }
        }

        // --- BRANDING FOOTER FOR PDF ---
        pdf.setTextColor(140);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.text("© 2026 Alivioscript Solutions | PalliCalc™", A4_W / 2, A4_H - 5, { align: "center" });

        pdf.save(filename);

    } catch (e) {
        alert("Unable to generate PDF. Error: " + e.message);
        console.error(e);
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// --- 6. QR CODE LOGIC ---
function trackAndShowQR() {
    // --- START TRACKING CODE ---
    if (typeof window.trackEvent === 'function') {
        window.trackEvent('patient_share', {
            'event_category': 'Patient Education',
            'event_label': document.title, // Tracks which leaflet is being shared
            'institution_id': (context && context.instId) ? context.instId : 'personal_user'
        });
    }
    // --- END TRACKING CODE ---
    showQR();
}

function showQR() {
    const modal = document.getElementById('qr-modal');
    const container = document.getElementById('qrcode');
    container.innerHTML = '';
    modal.style.display = 'flex';
    const baseUrl = window.location.origin + window.location.pathname;
    const qrUrl = context.instId ? `${baseUrl}?ref=${context.instId}` : window.location.href;
    new QRCode(container, { 
        text: qrUrl, 
        width: 180, 
        height: 180, 
        colorDark : "#000000", 
        colorLight : "#ffffff" 
    });
}

function closeQR() { 
    document.getElementById('qr-modal').style.display = 'none'; 
}

window.onclick = function(event) {
    const modal = document.getElementById('qr-modal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};