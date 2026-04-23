// ==========================================
// 1. CRITICAL APP SHELL (Must load for app to start)
// ==========================================
const CRITICAL_FILES = [
  './app.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './kkm-logo.png', 
  './pc-logo.png',
  './style.css',       
  './app-dashboard.js', 
  './js/ga-tracking.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions-compat.js' // <-- Added this one!
];
