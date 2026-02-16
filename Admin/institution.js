/* ================= FIREBASE CONFIG ================= */
const firebaseConfig = {
    apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
    authDomain: "pallicalc-eabdc.firebaseapp.com",
    projectId: "pallicalc-eabdc",
    storageBucket: "pallicalc-eabdc.firebasestorage.app",
    messagingSenderId: "347532270864",
    appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995"
  };
  
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();
  
  /* ================= VARIABLES ================= */
  let currentInstId = null;
  let currentLogosData = []; 
  
  // Adjusted paths with "../" because this file is in the Admin folder
  // and the images are likely in the main folder.
  const preAddedLogos = [
    { id: 'palli', src: '../icon-512.png' },
    { id: 'kkm', src: '../kkm-logo.png' },
    { id: 'pc', src: '../pc-logo.png' }
  ];
  
  const MAX_TOTAL_LOGOS = 2;
  const MAX_CUSTOM_UPLOADS = 1;
  const MAX_DIMENSION = 192; 
  const MAX_FILE_SIZE_KB = 10;
  
  /* ================= INIT & LISTENERS ================= */
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('instForm').addEventListener('submit', saveSettings);
    
    // Trigger upload click
    const uploadTrigger = document.getElementById('uploadTrigger');
    if(uploadTrigger) {
        uploadTrigger.onclick = () => document.getElementById('logoInput').click();
    }
  });

  document.getElementById("logoInput").addEventListener("change", function(e) {
    if (this.files && this.files[0]) {
      if (currentLogosData.length >= MAX_TOTAL_LOGOS) { alert(`Maximum ${MAX_TOTAL_LOGOS} logos.`); this.value = ""; return; }
      if (currentLogosData.filter(l => l.source === 'upload').length >= MAX_CUSTOM_UPLOADS) { alert("Max 1 custom upload."); this.value = ""; return; }
      
      document.getElementById("processingIndicator").style.display = "block";
      const reader = new FileReader();
      
      reader.onload = function(event) {
        const img = new Image();
        img.src = event.target.result;
        img.onload = function() {
          compressImageToDataUrl(img, MAX_DIMENSION, MAX_FILE_SIZE_KB, (base64) => {
            currentLogosData.push({ src: base64, source: 'upload' });
            renderLogos();
            document.getElementById("processingIndicator").style.display = "none";
            document.getElementById("logoInput").value = ""; 
          });
        };
      };
      reader.readAsDataURL(this.files[0]);
    }
  });
  
  /* ================= AUTH CHECK ================= */
  auth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = "../index.html"; return; }
    try {
      const snap = await db.collection("users").doc(user.uid).get();
      if (!snap.exists || snap.data().role !== "institutionAdmin") {
        alert("⛔ Access Restricted"); window.location.href = "../index.html"; return;
      }
      currentInstId = snap.data().institutionId;
      await loadData();
      renderGallery(); 
      document.getElementById("loadingOverlay").style.display = "none";
    } catch (e) {
      alert("Error: " + e.message); window.location.href = "../index.html";
    }
  });
  
  /* ================= DATA HANDLING ================= */
  async function loadData() {
    const doc = await db.collection("institutions").doc(currentInstId).get();
    if (doc.exists) {
      const data = doc.data();
      document.getElementById("instName").value = data.headerName || data.name || "";
      document.getElementById("instContact").value = data.headerContact || "";
      
      const savedLogos = data.headerLogos || [];
      currentLogosData = savedLogos.map(src => {
        const isBase64 = src.startsWith('data:image');
        return { src: src, source: isBase64 ? 'upload' : 'preset' };
      });
      renderLogos();
    }
  }
  
  function renderGallery() {
    const gallery = document.getElementById('logoGallery');
    gallery.innerHTML = '';
    preAddedLogos.forEach(logo => {
      const div = document.createElement('div');
      div.className = 'gallery-item';
      div.innerHTML = `<img src="${logo.src}">`;
      div.onclick = () => selectGalleryLogo(logo.src);
      gallery.appendChild(div);
    });
  }
  
  function selectGalleryLogo(src) {
    if (currentLogosData.length >= MAX_TOTAL_LOGOS) return alert('Maximum 2 logos allowed.');
    const exists = currentLogosData.some(logo => logo.src === src);
    if (exists) return alert("Already selected.");
    currentLogosData.push({ src: src, source: 'preset' });
    renderLogos();
  }
  
  function renderLogos() {
    const container = document.getElementById("logoContainer");
    const uploadBtn = document.getElementById("uploadTrigger");
    const existingCards = container.querySelectorAll(".logo-card");
    existingCards.forEach(c => c.remove());
  
    currentLogosData.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "logo-card";
      div.innerHTML = `<img src="${item.src}"><button type="button" class="btn-remove-logo" onclick="removeLogo(${index})"><i class="bi bi-x"></i></button>`;
      container.insertBefore(div, uploadBtn);
    });
  
    if (currentLogosData.length >= MAX_TOTAL_LOGOS || currentLogosData.filter(l => l.source === 'upload').length >= MAX_CUSTOM_UPLOADS) {
        uploadBtn.style.display = "none";
    } else {
        uploadBtn.style.display = "flex";
    }
  }
  
  window.removeLogo = function(index) {
    currentLogosData.splice(index, 1);
    renderLogos();
  };
  
  /* ================= IMAGE COMPRESSION ================= */
  function compressImageToDataUrl(imgObj, maxDim, maxKb, callback) {
    let w = imgObj.width, h = imgObj.height;
    if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } } 
    else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(imgObj, 0, 0, w, h);
    const targetBase64Len = maxKb * 1024 * 1.37; 
    let quality = 0.9;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > targetBase64Len && quality > 0.1) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    callback(dataUrl);
  }
  
  function dataURItoBlob(dataURI) {
    var byteString = atob(dataURI.split(',')[1]);
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], {type: mimeString});
  }
  
/* ================= SAVE LOGIC ================= */
async function saveSettings(e) {
  e.preventDefault();
  const btn = document.getElementById("saveBtn");
  const pwd = document.getElementById("adminPassword").value;
  const msg = document.getElementById("msgArea");
  const err = document.getElementById("errorArea");

  msg.style.display = "none";
  err.style.display = "none";
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';

  try {
    const user = auth.currentUser;
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, pwd);
    await user.reauthenticateWithCredential(cred);

    const name = document.getElementById("instName").value.trim();
    const contact = document.getElementById("instContact").value.trim();

    const finalLogos = [];

    for(let i=0; i < currentLogosData.length; i++) {
      let item = currentLogosData[i];

      if (item.src.startsWith("http")) {
          // If it's already a full web link, keep it as is
          finalLogos.push(item.src);
      } 
      else if (item.src.startsWith("data:image")) {
          // If it's a new upload (base64), upload to Firebase Storage
          let blob = dataURItoBlob(item.src);
          let path = `logos/${currentInstId}/upload_${Date.now()}_${i}.jpg`;
          let ref = storage.ref().child(path);
          await ref.put(blob);
          let downloadUrl = await ref.getDownloadURL();
          finalLogos.push(downloadUrl);
      } 
      else {
          // If it's a Preset Logo (e.g., "../icon-512.png")
          // We convert it to a full Absolute URL so the database can read it from anywhere.
          try {
              // This creates a full link like "https://yoursite.com/icon-512.png"
              // automatically resolving the "../" relative to the Admin folder.
              let fullUrl = new URL(item.src, window.location.href).href;
              finalLogos.push(fullUrl);
          } catch (error) {
              console.error("URL Error:", error);
              finalLogos.push(item.src); // Fallback
          }
      }
    }

    await db.collection("institutions").doc(currentInstId).set({
      headerName: name,
      headerContact: contact,
      headerLogos: finalLogos,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    msg.textContent = "✅ Saved! Presets linked to your site, Uploads to Firebase.";
    msg.style.display = "block";
    document.getElementById("adminPassword").value = "";
    
    // Refresh the view with the new saved URLs
    currentLogosData = finalLogos.map(url => ({ src: url, source: 'preset' }));
    renderLogos();

  } catch (error) {
    console.error(error);
    if (error.code === 'auth/wrong-password') err.textContent = "❌ Incorrect password.";
    else err.textContent = "❌ Error: " + error.message;
    err.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save2"></i> Update Institution Details';
  }
}