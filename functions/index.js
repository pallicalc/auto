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

// 🔥 TRUST SYSTEM: INSTANT 1-YEAR RENEWAL
exports.reportPayment = onRequest({ cors: true }, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Token' });
    const idToken = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const { referenceNo } = req.body;

        if (!referenceNo) return res.status(400).json({ error: "Transaction Reference Number is required." });

        const userRef = admin.firestore().collection('users').doc(uid);
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        // 1. Calculate New Expiry (Add 1 Year)
        let currentEnd = userData.subscriptionEnd ? userData.subscriptionEnd.toDate() : new Date();
        // If account was already expired, start the new year from TODAY.
        if (currentEnd < new Date()) currentEnd = new Date();
        
        const newSubscriptionEnd = new Date(currentEnd);
        newSubscriptionEnd.setFullYear(newSubscriptionEnd.getFullYear() + 1);

        // 2. Update Database (Instant Access)
        await userRef.update({
            billingStatus: 'active-trust-renewal', // Grants Green Status
            subscriptionEnd: admin.firestore.Timestamp.fromDate(newSubscriptionEnd),
            lastPaymentRef: referenceNo,
            lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
            paymentNeedsAudit: true, // Flag for you to check later
            hasPaidOnce: true // Ensures they don't get "First Year Free" logic again
        });

        // 3. Notify Admin (You)
        await transporter.sendMail({
            from: '"PalliCalc System" <pallicalc@gmail.com>',
            to: "chai.alison@gmail.com", // YOUR EMAIL
            subject: `💰 Payment Claimed: ${referenceNo}`,
            html: `
                <h3>Payment Claimed (Trust System)</h3>
                <p><strong>User:</strong> ${userData.email}</p>
                <p><strong>Ref No:</strong> ${referenceNo}</p>
                <p><strong>Action:</strong> System automatically extended access for 1 year.</p>
                <hr>
                <p>Please verify this transaction in your Bank/Stripe dashboard when you have time.</p>
            `
        });

        res.status(200).json({ success: true, newDate: newSubscriptionEnd });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
          updateData.isMoH = false;
          updateData.billingStatus = 'active-first-year'; 
          updateData.futureBilling = true;
          updateData.hasPaidOnce = false;
          updateData.manualDiscount = 0; 
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

// --- 3. THE GRIM REAPER ---
exports.checkGracePeriods = onSchedule("every 24 hours", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const expiredUsersSnapshot = await admin.firestore().collection('users')
        .where('gracePeriodEnd', '<=', now)
        .get();

    const deletePromises = [];
    expiredUsersSnapshot.forEach(doc => deletePromises.push(admin.auth().deleteUser(doc.id)));
    await Promise.all(deletePromises);
});

exports.notifyStaffRemoval = onDocumentUpdated("users/{userId}", async (event) => {
    const newData = event.data.after.data();
    const isNowScheduled = newData.gracePeriodEnd;

    if (isNowScheduled) {
        const dateString = isNowScheduled.toDate().toLocaleDateString("en-GB", { day: 'numeric', month: 'long', year: 'numeric' });
        try {
            await transporter.sendMail({
                from: '"PalliCalc Admin" <pallicalc@gmail.com>',
                to: newData.email,
                subject: `Account Removal Notice`,
                html: `<p>Your account is scheduled for deletion on ${dateString}. Contact admin to restore.</p>`
            });
        } catch (error) { console.error(error); }
    }
});

// --- 4. COUNTER & COUPONS ---
exports.onUserCreated = onDocumentCreated("users/{userId}", async (event) => {
    const newData = event.data.data();
    const userId = event.params.userId;
    const institutionId = newData.institutionId;

    if (newData.countProcessed === true) return;

    const batch = admin.firestore().batch();
    const userRef = event.data.ref;

    if (newData.role === 'institutionAdmin') {
        let billingStatus = 'active-first-year';
        let futureBilling = true;
        let subEnd = new Date();
        subEnd.setFullYear(subEnd.getFullYear() + 1);
        let subEndTimestamp = admin.firestore.Timestamp.fromDate(subEnd);
        let manualDiscount = 0; 

        if (newData.promoCode) {
            const codeClean = newData.promoCode.toUpperCase().trim();
            const couponRef = admin.firestore().collection('coupons').doc(codeClean);
            const couponDoc = await couponRef.get();
            if (couponDoc.exists && couponDoc.data().usedCount < couponDoc.data().maxUses) {
                batch.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
                manualDiscount = couponDoc.data().discountPercent;
                if (manualDiscount === 100) {
                    billingStatus = 'trial-free-lifetime';
                    futureBilling = false;
                    subEndTimestamp = null; 
                }
            }
        }

        if (newData.isMoH === true) {
             batch.update(userRef, { billingStatus: 'trial-free-lifetime', futureBilling: false });
        } else {
            const updates = { billingStatus, futureBilling, hasPaidOnce: false, manualDiscount };
            if (subEndTimestamp) updates.subscriptionEnd = subEndTimestamp;
            batch.update(userRef, updates);
        }
    }

    if (institutionId && !newData.institutionName) {
         const instDoc = await admin.firestore().collection('institutions').doc(institutionId).get();
         if (instDoc.exists) batch.update(userRef, { institutionName: instDoc.data().name });
    }
    if (institutionId) {
        batch.update(admin.firestore().collection('institutions').doc(institutionId), { memberCount: admin.firestore.FieldValue.increment(1) });
    }
    batch.update(userRef, { countProcessed: true });
    await batch.commit();
});

// --- 5. CLEANUP & BILLING NOTICES ---
exports.onUserDeleted = v1.auth.user().onDelete(async (user) => {
    const userDoc = await admin.firestore().collection('users').doc(user.uid).get();
    if (userDoc.exists && userDoc.data().institutionId) {
        await admin.firestore().collection('institutions').doc(userDoc.data().institutionId).update({
            memberCount: admin.firestore.FieldValue.increment(-1)
        }).catch(e => console.log(e));
        await userDoc.ref.delete();
    }
});

exports.testEmailConnection = onRequest({ cors: true }, async (req, res) => {
    try {
        await transporter.verify(); 
        res.status(200).send(`Email System Healthy.`);
    } catch (error) { res.status(500).send(`FAILED: ${error.message}`); }
});

exports.checkSubscriptionExpiry = onSchedule("every 24 hours", async (event) => {
    const start = new Date(); start.setDate(start.getDate() + 7); start.setHours(0,0,0,0);
    const end = new Date(); end.setDate(end.getDate() + 7); end.setHours(23,59,59,999);
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '>=', admin.firestore.Timestamp.fromDate(start))
        .where('subscriptionEnd', '<=', admin.firestore.Timestamp.fromDate(end)).get();
    snapshot.forEach(doc => {
        transporter.sendMail({ from: 'pallicalc@gmail.com', to: doc.data().email, subject: 'Subscription Expiring', html: '<p>Renew via dashboard.</p>' });
    });
});

exports.sendBillingNotice = onSchedule("every 24 hours", async (event) => {
    const now = new Date(); const target = new Date(); target.setDate(now.getDate() + 30); 
    const start = new Date(target.setHours(0,0,0,0)); const end = new Date(target.setHours(23,59,59,999));
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '>=', admin.firestore.Timestamp.fromDate(start))
        .where('subscriptionEnd', '<=', admin.firestore.Timestamp.fromDate(end)).get();
    snapshot.forEach(doc => {
        if (doc.data().billingStatus !== 'trial-free-lifetime') {
            transporter.sendMail({ from: 'pallicalc@gmail.com', to: doc.data().email, subject: 'Invoice Ready', html: '<p>Payment window open.</p>' });
        }
    });
});

exports.enforceSuspension = onSchedule("every 24 hours", async (event) => {
    const graceLimit = new Date(); graceLimit.setDate(graceLimit.getDate() - 30); 
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '<', admin.firestore.Timestamp.fromDate(graceLimit))
        .where('billingStatus', '!=', 'suspended').get();
    const batch = admin.firestore().batch();
    snapshot.forEach(doc => {
        batch.update(doc.ref, { billingStatus: 'suspended' });
        if (doc.data().institutionId) batch.update(admin.firestore().collection('institutions').doc(doc.data().institutionId), { status: 'suspended' });
    });
    await batch.commit();
});
