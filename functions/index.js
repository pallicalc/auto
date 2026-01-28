const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const v1 = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// --- 1. EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "pallicalc@gmail.com",
    pass: "iwsh izyr ledc tldk" // Your App Password
  }
});

// --- 2. HTTP APIs ---

exports.requestTransferLink = onRequest({ cors: true }, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Token' });
    const idToken = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const email = decodedToken.email;
      const uid = decodedToken.uid;
      const customToken = await admin.auth().createCustomToken(uid);
      const pageLink = `https://pallicalc-eabdc.web.app/transfer-complete.html`;

      await transporter.sendMail({
        from: '"PalliCalc Security" <pallicalc@gmail.com>',
        to: email,
        subject: 'Security Code: Admin Transfer Request',
        html: `<p>Your code is: <strong>${customToken}</strong></p><p><a href="${pageLink}">Click here to verify</a></p>`
      });

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

exports.completeAdminTransfer = onRequest({ cors: true }, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Not Logged In' });
    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      const { newEmail, newPassword } = req.body;
      
      const isGov = newEmail.toLowerCase().endsWith('.gov.my'); 

      await admin.auth().updateUser(uid, { email: newEmail, password: newPassword, emailVerified: true });
      
      const updateData = {
        email: newEmail,
        role: 'institutionAdmin',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (isGov) {
          updateData.isMoH = true;
          updateData.billingStatus = 'trial-free-lifetime';
          updateData.futureBilling = false;
      } else {
          // Reset to Paid Track
          updateData.isMoH = false;
          updateData.billingStatus = 'active-first-year'; 
          updateData.futureBilling = true;
          updateData.hasPaidOnce = false;
          updateData.manualDiscount = 0; // Reset any old discounts
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
          updateData.subscriptionEnd = admin.firestore.Timestamp.fromDate(oneYearFromNow);
      }

      await admin.firestore().collection('users').doc(uid).update(updateData);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// --- 3. THE GRIM REAPER (Daily Checks) ---
exports.checkGracePeriods = onSchedule("every 24 hours", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const expiredUsersSnapshot = await admin.firestore().collection('users')
        .where('gracePeriodEnd', '<=', now)
        .get();

    const deletePromises = [];
    expiredUsersSnapshot.forEach(doc => {
        console.log(`Time is up for user: ${doc.id}. Deleting.`);
        deletePromises.push(admin.auth().deleteUser(doc.id));
    });
    await Promise.all(deletePromises);
});

exports.notifyStaffRemoval = onDocumentUpdated("users/{userId}", async (event) => {
    const newData = event.data.after.data();
    const email = newData.email;
    const isNowScheduled = newData.gracePeriodEnd;

    if (isNowScheduled) {
        const dateString = isNowScheduled.toDate().toLocaleDateString("en-GB", { day: 'numeric', month: 'long', year: 'numeric' });
        try {
            await transporter.sendMail({
                from: '"PalliCalc Admin" <pallicalc@gmail.com>',
                to: email,
                subject: `Account Removal Notice`,
                html: `<p>Your account is scheduled for deletion on ${dateString}. Contact admin to restore.</p>`
            });
        } catch (error) { console.error(error); }
    }
});

// --- 4. COUNTER & REGISTRATION COUPONS (UPDATED!) ---
exports.onUserCreated = onDocumentCreated("users/{userId}", async (event) => {
    const newData = event.data.data();
    const userId = event.params.userId;
    const institutionId = newData.institutionId;

    if (newData.countProcessed === true) return;

    const batch = admin.firestore().batch();
    const userRef = event.data.ref;

    // 1. BILLING & COUPON LOGIC
    if (newData.role === 'institutionAdmin') {
        
        let billingStatus = 'active-first-year';
        let futureBilling = true;
        let subEnd = new Date();
        subEnd.setFullYear(subEnd.getFullYear() + 1);
        let subEndTimestamp = admin.firestore.Timestamp.fromDate(subEnd);
        let manualDiscount = 0; // Default 0% discount

        // A. Check Registration Coupon
        if (newData.promoCode) {
            const codeClean = newData.promoCode.toUpperCase().trim();
            const couponRef = admin.firestore().collection('coupons').doc(codeClean);
            const couponDoc = await couponRef.get();
            
            if (couponDoc.exists) {
                const couponData = couponDoc.data();
                if (couponData.usedCount < couponData.maxUses) {
                    
                    // Increment usage
                    batch.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
                    
                    // Apply Discount
                    manualDiscount = couponData.discountPercent;
                    
                    // If 100% Off -> Lifetime Free
                    if (manualDiscount === 100) {
                        billingStatus = 'trial-free-lifetime';
                        futureBilling = false;
                        subEndTimestamp = null; // No expiry for free users
                    }
                    console.log(`Coupon ${codeClean} applied for ${userId}. Discount: ${manualDiscount}%`);
                }
            }
        }

        // B. Apply to User
        if (newData.isMoH === true) {
             batch.update(userRef, { billingStatus: 'trial-free-lifetime', futureBilling: false });
        } 
        else {
            const updates = { 
                billingStatus: billingStatus,
                futureBilling: futureBilling,
                hasPaidOnce: false,
                manualDiscount: manualDiscount // Saves discount to DB
            };
            if (subEndTimestamp) updates.subscriptionEnd = subEndTimestamp;
            batch.update(userRef, updates);
        }
    }

    // 2. Fix Institution Name
    if (institutionId && !newData.institutionName) {
         const instDoc = await admin.firestore().collection('institutions').doc(institutionId).get();
         if (instDoc.exists) batch.update(userRef, { institutionName: instDoc.data().name });
    }

    // 3. Counter
    if (institutionId) {
        const institutionRef = admin.firestore().collection('institutions').doc(institutionId);
        batch.update(institutionRef, { memberCount: admin.firestore.FieldValue.increment(1) });
    }

    batch.update(userRef, { countProcessed: true });
    await batch.commit();
});

// --- 5. CLEANUP & BILLING NOTICES ---
exports.onUserDeleted = v1.auth.user().onDelete(async (user) => {
    const userDoc = await admin.firestore().collection('users').doc(user.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.institutionId) {
            await admin.firestore().collection('institutions').doc(userData.institutionId).update({
                memberCount: admin.firestore.FieldValue.increment(-1)
            }).catch(e => console.log(e));
        }
        await userDoc.ref.delete();
    }
});

// --- 6. THE DEBUGGER (I put this back for you!) ---
exports.testEmailConnection = onRequest({ cors: true }, async (req, res) => {
    const testRecipient = "chai.alison@gmail.com"; 
    try {
        await transporter.verify(); 
        await transporter.sendMail({ 
            from: '"PalliCalc Test" <pallicalc@gmail.com>', to: testRecipient,
            subject: 'Test Email Connection', html: '<p>System Healthy.</p>'
        });
        res.status(200).send(`Email sent to ${testRecipient}`);
    } catch (error) {
        res.status(500).send(`FAILED: ${error.message}`);
    }
});

// --- 7. BILLING AUTOMATION ---
exports.checkSubscriptionExpiry = onSchedule("every 24 hours", async (event) => {
    // 7-day Warning
    const start = new Date(); start.setDate(start.getDate() + 7); start.setHours(0,0,0,0);
    const end = new Date(); end.setDate(end.getDate() + 7); end.setHours(23,59,59,999);
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '>=', admin.firestore.Timestamp.fromDate(start))
        .where('subscriptionEnd', '<=', admin.firestore.Timestamp.fromDate(end))
        .get();
    snapshot.forEach(doc => {
        transporter.sendMail({
            from: 'pallicalc@gmail.com', to: doc.data().email,
            subject: 'Subscription Expiring Soon', html: '<p>Please renew via dashboard.</p>'
        });
    });
});

exports.sendBillingNotice = onSchedule("every 24 hours", async (event) => {
    // Month 11 Invoice
    const now = new Date(); const target = new Date(); target.setDate(now.getDate() + 30); 
    const start = new Date(target.setHours(0,0,0,0)); const end = new Date(target.setHours(23,59,59,999));
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '>=', admin.firestore.Timestamp.fromDate(start))
        .where('subscriptionEnd', '<=', admin.firestore.Timestamp.fromDate(end))
        .get();
    snapshot.forEach(doc => {
        if (doc.data().billingStatus !== 'trial-free-lifetime') {
            transporter.sendMail({
                from: 'pallicalc@gmail.com', to: doc.data().email,
                subject: 'Invoice Ready', html: '<p>Payment window is open.</p>'
            });
        }
    });
});

exports.enforceSuspension = onSchedule("every 24 hours", async (event) => {
    // Month 13 Suspension
    const graceLimit = new Date(); graceLimit.setDate(graceLimit.getDate() - 30); 
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '<', admin.firestore.Timestamp.fromDate(graceLimit))
        .where('billingStatus', '!=', 'trial-free-lifetime')
        .where('billingStatus', '!=', 'suspended') 
        .get();
    const batch = admin.firestore().batch();
    snapshot.forEach(doc => {
        batch.update(doc.ref, { billingStatus: 'suspended' });
        if (doc.data().institutionId) {
            batch.update(admin.firestore().collection('institutions').doc(doc.data().institutionId), { status: 'suspended' });
        }
    });
    await batch.commit();
});
