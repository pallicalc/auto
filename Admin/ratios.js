// --- Auto-Inject Favicon into Header ---
(function() {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    // Adjust path based on where this script runs. 
    // If diagnostic.js is in a subfolder, use '../favicon.png'
    link.href = '/favicon.png'; 
})();

/* ---------------- FIREBASE CONFIG ---------------- */
const firebaseConfig = {
    apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
    authDomain: "pallicalc-eabdc.firebaseapp.com",
    projectId: "pallicalc-eabdc",
    storageBucket: "pallicalc-eabdc.firebasestorage.app",
    messagingSenderId: "347532270864",
    appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995",
    measurementId: "G-6G9C984F8E"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  /* ---------------- AUTH CHECK ---------------- */
  auth.onAuthStateChanged(async user => {
    const overlay = document.getElementById('loadingOverlay');
    const content = document.getElementById('mainContent');

    if (!user) {
      console.warn("No user found. Redirecting...");
      window.location.href = "../index.html"; // Redirect to login
      return;
    }

    try {
      // Check Admin Role
      const snap = await db.collection("users").doc(user.uid).get();
      
      if (!snap.exists || snap.data().role !== "institutionAdmin") {
        console.warn("User is not an admin. Redirecting...");
        window.location.href = "../index.html";
        return;
      }

      // Success: Show Content
      if (overlay) overlay.style.display = "none";
      if (content) content.style.display = "block";

    } catch (error) {
      console.error("Auth Check Error:", error);
      alert("Error verifying permissions. Please login again.");
      window.location.href = "../index.html";
    }
  });