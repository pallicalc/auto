// 🔥 FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
    authDomain: "pallicalc-eabdc.firebaseapp.com",
    projectId: "pallicalc-eabdc",
    storageBucket: "pallicalc-eabdc.firebasestorage.app",
    messagingSenderId: "347532270864",
    appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995",
    measurementId: "G-6G9C984F8E"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================
// 🔐 SECURITY & AUTH LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Attach event listeners
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('transferBtn').addEventListener('click', requestTransferLink);
    document.getElementById('submitFeedbackBtn').addEventListener('click', submitFeedback);

    // Monitor Auth State
    auth.onAuthStateChanged(async (user) => {
        // UI Elements
        const loginMsg = document.getElementById('loginMessage');
        const loginText = document.getElementById('loginText');
        const statusBar = document.getElementById('statusBar');
        
        // Target the wrapper and feedback section
        const mainWrapper = document.getElementById('main-wrapper');
        const feedbackSection = document.getElementById('feedbackSection');

        // Reset UI to hidden state
        loginMsg.classList.add('d-none');
        statusBar.classList.add('d-none');
        
        // Hide the main sections
        if(mainWrapper) mainWrapper.classList.add('d-none');
        if(feedbackSection) feedbackSection.classList.add('d-none');

        // 1. Check if User exists
        if (!user) {
            loginText.textContent = "Institution administrator login needed for this page.";
            loginMsg.classList.remove('d-none');
            return;
        }

        try {
            // 2. Check Database for Role
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            // 🛑 STRICT SECURITY CHECK
            if (!userDoc.exists || userDoc.data().role !== 'institutionAdmin') {
                console.warn("Security Alert: Unauthorized access attempt.");
                
                // Show Access Denied UI
                loginMsg.innerHTML = `
                    <h4 class="alert-heading text-danger"><i class="bi bi-x-circle"></i> Access Denied</h4>
                    <p>You are logged in as <strong>${user.email}</strong>, but this account is not an Institution Admin.</p>
                    <hr>
                    <div class="d-flex justify-content-center">
                        <button onclick="handleLogout()" class="btn btn-danger me-2">Logout</button>
                        <button onclick="window.location.href='index.html'" class="btn btn-outline-danger">Go to User Home</button>
                    </div>`;
                loginMsg.classList.remove('d-none');
                return;
            }

            // 3. Access Granted: Show the Dashboard
            document.getElementById('adminEmail').textContent = user.email;
            statusBar.classList.remove('d-none');
            
            // Reveal the Main Content and Feedback Section
            if(mainWrapper) mainWrapper.classList.remove('d-none');
            if(feedbackSection) feedbackSection.classList.remove('d-none');

            // --- NEW LOGIC: BILLING CARD VISIBILITY ---
            const email = user.email.toLowerCase();
            const isGov = email.endsWith('.gov.my') || email.endsWith('.moh.gov.my');

            // Only remove the 'd-none' class if they are NOT government
            if (!isGov) {
                const billingCard = document.getElementById('billingCard');
                if (billingCard) {
                    billingCard.classList.remove('d-none');
                }
            }
            // ------------------------------------------

        } catch (error) {
            console.error('Auth check failed:', error);
            loginMsg.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
            loginMsg.classList.remove('d-none');
        }
    });
});

function handleLogout() {
    auth.signOut().then(() => window.location.href = 'index.html');
}

// ==========================================
// 📧 TRANSFER ACCOUNT LOGIC
// ==========================================
async function requestTransferLink() {
    const status = document.getElementById('transferStatus');
    const btn = document.getElementById('transferBtn'); 
    const user = auth.currentUser;

    if (!user) return alert("Please log in first.");

    // Disable button immediately
    btn.disabled = true;
    const originalText = '<i class="bi bi-envelope me-2"></i> Send Transfer Link';
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
    
    try {
        const idToken = await user.getIdToken();

        // Call Backend Function
        const response = await fetch('https://us-central1-pallicalc-eabdc.cloudfunctions.net/requestTransferLink', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (response.ok) {
            status.innerHTML = `
            <div class="alert alert-success alert-dismissible fade show mt-2">
                <strong>Email Sent!</strong><br>
                ⚠️ <strong>Please Wait:</strong> Due to firewall security, the email may take <strong>up to 10 minutes</strong> to arrive.<br>
                Please do not press send again.
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
            `;
            
            alert("✅ Email Sent!\n\nNOTE: Due to government firewall security, it may take up to 10 MINUTES to arrive.\n\nPlease be patient.");

            // Anti-Spam Timer (2 minutes)
            btn.innerText = "Email Sent (Wait 2m)";
            btn.classList.add('btn-secondary'); // Visual disable style
            btn.classList.remove('btn-warning');
            
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-warning');
            }, 120000); 

        } else {
            throw new Error(data.error || "Server rejected request.");
        }

    } catch (error) {
        status.innerHTML = `<div class="alert alert-danger mt-2">Failed: ${error.message}</div>`;
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ==========================================
// 💬 FEEDBACK LOGIC
// ==========================================
async function submitFeedback() {
    const title = document.getElementById('feedbackTitle').value.trim();
    const text = document.getElementById('feedbackText').value.trim();
    const status = document.getElementById('feedbackStatus');
    const user = auth.currentUser;

    if (!title || !text) {
        status.innerHTML = '<div class="alert alert-warning">Please fill title and message</div>';
        return;
    }

    status.innerHTML = '<div class="alert alert-info">Sending feedback...</div>';

    try {
        await db.collection('adminFeedback').add({
            title, 
            text,
            adminEmail: user.email,
            uid: user.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        status.innerHTML = `<div class="alert alert-success alert-dismissible fade show">Thank you! Feedback received.<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`;
        document.getElementById('feedbackTitle').value = '';
        document.getElementById('feedbackText').value = '';
    } catch (error) {
        status.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}
