// File: js/ga-tracking.js
(function() {
    // 1. Load Google Analytics
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-6G9C984F8E';
    document.head.appendChild(script);

    // 2. Initialize
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    // 3. SMART DETECTION: Who is this user?
    var urlParams = new URLSearchParams(window.location.search);
    var institutionId = urlParams.get('ref');

    // Fallback: Check local storage
    if (!institutionId) {
        try {
            var settings = JSON.parse(localStorage.getItem('institutionSettings'));
            if (settings && settings.name) {
                institutionId = settings.name; 
            }
        } catch(e) {}
    }

    // Default to 'public_user' if no ID found
    var finalId = institutionId || 'public_user';

    // 4. Send the Data
    gtag('config', 'G-6G9C984F8E', {
        'page_title': document.title,
        'page_path': window.location.pathname,
        'institution_id': finalId,  // <--- Tracks which hospital
        'user_properties': {
            'user_type': window.location.pathname.includes('education') ? 'Patient' : 'Clinician'
        }
    });

    console.log("📊 Tracking View for: " + finalId);
})();