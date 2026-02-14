// File: js/ga-tracking.js
(function() {
    // 1. Load Google Analytics Script (Always load it, even if offline, browser caches it)
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-6G9C984F8E';
    document.head.appendChild(script);

    // 2. Initialize DataLayer
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    // Make gtag global so other scripts can use it
    window.gtag = gtag;

    // 3. SMART DETECTION: Who is this user? (Existing Logic)
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

    // Prepare the Config Object
    var configData = {
        'page_title': document.title,
        'page_path': window.location.pathname,
        'institution_id': finalId,
        'user_properties': {
            'user_type': window.location.pathname.includes('education') ? 'Patient' : 'Clinician'
        },
        'timestamp': new Date().toISOString() // Add timestamp for offline data
    };

    // 4. Store & Forward Logic

    // Function to send data to GA
    function sendToGA(data) {
        // If it's a config event
        if (data.type === 'config') {
            gtag('config', 'G-6G9C984F8E', {
                'page_title': data.page_title,
                'page_path': data.page_path,
                'institution_id': data.institution_id,
                'user_properties': data.user_properties
            });
        } 
        // If it's a custom event
        else if (data.type === 'event') {
            gtag('event', data.action, data.params);
        }
        console.log("📊 Sent Tracking " + data.type + " for: " + (data.institution_id || 'unknown'));
    }

    // Global function to track events with offline support
    window.trackEvent = function(action, params) {
        var eventData = {
            'type': 'event',
            'action': action,
            'params': params,
            'institution_id': finalId,
            'timestamp': new Date().toISOString()
        };

        if (navigator.onLine) {
            sendToGA(eventData);
        } else {
            console.log("⚠️ Offline: Queuing GA event: " + action);
            var queue = JSON.parse(localStorage.getItem('ga_offline_queue') || '[]');
            queue.push(eventData);
            localStorage.setItem('ga_offline_queue', JSON.stringify(queue));
        }
    };

    // Function to process the offline queue
    function processOfflineQueue() {
        var queue = JSON.parse(localStorage.getItem('ga_offline_queue') || '[]');
        if (queue.length > 0) {
            console.log("🔄 Processing " + queue.length + " offline events...");
            queue.forEach(function(event) {
                sendToGA(event);
            });
            // Clear queue after sending
            localStorage.removeItem('ga_offline_queue');
        }
    }

    // Main Check: Online or Offline?
    if (navigator.onLine) {
        // Online: Send immediately
        sendToGA(Object.assign({ type: 'config' }, configData));
        // Also check if there's anything pending from before
        processOfflineQueue();
    } else {
        // Offline: Queue it
        console.log("⚠️ Offline: Queuing GA pageview.");
        var queue = JSON.parse(localStorage.getItem('ga_offline_queue') || '[]');
        queue.push(Object.assign({ type: 'config' }, configData));
        localStorage.setItem('ga_offline_queue', JSON.stringify(queue));
    }

    // 5. Sync Listener (When internet returns)
    window.addEventListener('online', function() {
        console.log("🌐 Back Online: Syncing GA events...");
        processOfflineQueue();
    });

})();
