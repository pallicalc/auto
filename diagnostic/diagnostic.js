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

// 1. SIMPLE SUM SCORING (HTML handles the logic)
function calculateTotalScore() {
    let total = 0;
    
    // Find all checked radio buttons inside the form
    const checkedInputs = document.querySelectorAll('#iposForm input[type="radio"]:checked');
    
    checkedInputs.forEach(input => {
        // The HTML value is already the correct 'score' (e.g., 4 for 'Not at all' on Q6)
        total += parseInt(input.value);
    });

    const display = document.getElementById('total-score-display');
    if(display) display.innerText = total;
    
    return total;
}

// 2. QR GENERATION
function generateQR() {
    // Helper to safely get value
    const getVal = (name) => {
        const el = document.querySelector(`input[name="${name}"]:checked`);
        return el ? parseInt(el.value) : 0;
    };

    const payload = {
        t: "IPOS",
        d: Date.now(),
        score: calculateTotalScore(),
        q1: document.getElementById('q1_input').value.substring(0, 100),
        s: { // Symptoms
            p: getVal('pain'), s: getVal('sob'), w: getVal('weak'),
            n: getVal('nau'), v: getVal('vom'), a: getVal('app'),
            c: getVal('con'), m: getVal('mou'), d: getVal('dro'),
            mb: getVal('mob')
        },
        o: { // Other
             l: document.getElementById('other_sym_label').value.substring(0,20),
             v: getVal('other_sym_val')
        },
        p: { // Psychosocial
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

// 3. BRANDING UTILITIES
async function loadInstitutionData(id) {
    if (!id) return;
    try {
        const cached = localStorage.getItem('cached_inst_' + id);
        if (cached) applyBranding(JSON.parse(cached));
        
        const doc = await db.collection('institutions').doc(id).get();
        if (doc.exists) {
            const data = doc.data();
            if(data.status === 'suspended') return;
            localStorage.setItem('cached_inst_' + id, JSON.stringify(data));
            applyBranding(data);
        }
    } catch (e) { console.error(e); }
}

function applyBranding(data) {
    const name = data.headerName || data.name;
    const logo = (data.headerLogos && data.headerLogos[0]) || data.logo;
    if(name) {
        document.getElementById('inst-name-display').textContent = name;
        document.getElementById('footer-inst-name').textContent = name;
    }
    if(data.headerContact) document.getElementById('inst-contact-display').textContent = data.headerContact;
    if(logo) {
        document.getElementById('inst-logo-img').src = logo;
        document.getElementById('inst-logo-img').style.display = 'block';
        document.getElementById('inst-header-container').style.display = 'flex';
    }
}