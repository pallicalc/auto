const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
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
    // ✅ This now reads from the .env file in your functions folder
    pass: process.env.GMAIL_PASS 
  }
});

// --- 2. HTTP APIs ---

// A. TRUST SYSTEM: INSTANT 1-YEAR RENEWAL
exports.reportPayment = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const uid = request.auth.uid;
    const { referenceNo } = request.data; 

    if (!referenceNo) throw new HttpsError('invalid-argument', 'Reference Number required.');

    try {
        const userRef = admin.firestore().collection('users').doc(uid);
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        let currentEnd = userData.subscriptionEnd ? userData.subscriptionEnd.toDate() : new Date();
        if (currentEnd < new Date()) currentEnd = new Date();
        
        const newSubscriptionEnd = new Date(currentEnd);
        newSubscriptionEnd.setFullYear(newSubscriptionEnd.getFullYear() + 1);

        await userRef.update({
            billingStatus: 'active-trust-renewal', 
            subscriptionEnd: admin.firestore.Timestamp.fromDate(newSubscriptionEnd),
            lastPaymentRef: referenceNo,
            lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
            paymentNeedsAudit: true, 
            hasPaidOnce: true 
        });

        // Email to Admin
        await transporter.sendMail({
            from: '"PalliCalc System" <pallicalc@gmail.com>',
            to: "pallicalc@gmail.com", 
            subject: `💰 Payment Claimed: ${referenceNo}`,
            html: `<p>User ${userData.email} claimed payment (Ref: ${referenceNo}). System auto-renewed for 1 year.</p>`
        });

        return { success: true, newDate: newSubscriptionEnd };
    } catch (error) {
        console.error("Payment Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

// B. REQUEST TRANSFER LINK
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
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// C. COMPLETE TRANSFER
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
          updateData.currency = 'MYR'; 
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
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- 3. THE LONG-TERM RETENTION MONITOR (Month 13) ---
// preventing auto-deletion. Now notifies Admin instead.
exports.checkGracePeriods = onSchedule("every 24 hours", async (event) => {
    const now = new Date();
    const retentionLimit = new Date();
    
    // Set 'Month 13' threshold (1 year ago)
    retentionLimit.setMonth(now.getMonth() - 12); 

    // Find users older than 12 months who haven't been flagged yet
    const expiredUsersSnapshot = await admin.firestore().collection('users')
        .where('gracePeriodEnd', '<=', admin.firestore.Timestamp.fromDate(retentionLimit))
        .where('retentionAlertSent', '!=', true) // ✅ Prevents spamming you every day
        .get();

    if (expiredUsersSnapshot.empty) return;

    const batch = admin.firestore().batch();
    const emailPromises = [];

    expiredUsersSnapshot.forEach(doc => {
        const userData = doc.data();
        
        // 1. Force Suspend & Flag as "Review Needed"
        batch.update(doc.ref, { 
            billingStatus: 'suspended',
            retentionAlertSent: true,
            needsAdminReview: true
        });

        // 2. Notify YOU (The Admin)
        emailPromises.push(transporter.sendMail({
            from: '"PalliCalc System" <pallicalc@gmail.com>',
            to: "pallicalc@gmail.com",
            subject: `⚠️ RETENTION ALERT: Month 13 Reached`,
            html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #f0ad4e;">
                <h3 style="color: #d9534f;">Long-Term Retention Alert</h3>
                <p>The following user has passed the 12-month retention period:</p>
                <ul>
                    <li><strong>User Email:</strong> ${userData.email}</li>
                    <li><strong>Institution:</strong> ${userData.institutionName || 'N/A'}</li>
                    <li><strong>Role:</strong> ${userData.role}</li>
                </ul>
                <p><strong>Action Taken:</strong> Account suspended & flagged.</p>
                <p>Please review this account manually to decide on deletion or archival.</p>
            </div>
            `
        }));
    });

    await batch.commit();
    if (emailPromises.length > 0) await Promise.all(emailPromises);
});

// (Removed 'notifyStaffRemoval' to prevent sending confusing "Deletion" emails to users)

// --- 4. COUNTER & COUPONS (Updated: One-Time Use Logic) ---
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
        let manualDiscount = 0; // Default: No permanent discount
        let hasPaidOnce = false; 

        // Detect Currency based on Country
        const country = newData.country ? newData.country.trim().toLowerCase() : "malaysia";
        const currency = (country === "malaysia") ? "MYR" : "USD";

        if (newData.promoCode) {
            const codeClean = newData.promoCode.toUpperCase().trim();
            const couponRef = admin.firestore().collection('coupons').doc(codeClean);
            const couponDoc = await couponRef.get();
            
            if (couponDoc.exists && couponDoc.data().usedCount < couponDoc.data().maxUses) {
                batch.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
                
                const discountPercent = couponDoc.data().discountPercent;
                
                // LOGIC CHANGE: Coupon affects 'billingStatus' but NOT 'manualDiscount' for future.
                if (discountPercent === 100) {
                      // 100% OFF: Gives them a free first year, but keeps 'hasPaidOnce' as FALSE
                      // This means next year they must pay (unless manually overridden by admin).
                      billingStatus = 'active-first-year';
                }
            }
        }

        if (newData.isMoH === true) {
             batch.update(userRef, { billingStatus: 'trial-free-lifetime', futureBilling: false, currency: "MYR" });
        } else {
            // Apply updates. Note: manualDiscount stays 0 unless Admin changes it manually later.
            const updates = { billingStatus, futureBilling, hasPaidOnce, manualDiscount, currency };
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

exports.onUserDeleted = v1.auth.user().onDelete(async (user) => {
    const userDoc = await admin.firestore().collection('users').doc(user.uid).get();
    if (userDoc.exists && userDoc.data().institutionId) {
        await admin.firestore().collection('institutions').doc(userDoc.data().institutionId).update({
            memberCount: admin.firestore.FieldValue.increment(-1)
        }).catch(e => { /* console.log(e) */ });
        await userDoc.ref.delete();
    }
});

exports.testEmailConnection = onRequest({ cors: true }, async (req, res) => {
    try {
        await transporter.verify(); 
        res.status(200).send(`Email System Healthy.`);
    } catch (error) { res.status(500).send(`FAILED: ${error.message}`); }
});

// --- 5. AUTOMATED REMINDERS ---

// A. Month 12: Warning 7 Days Before Expiry
exports.checkSubscriptionExpiry = onSchedule("every 24 hours", async (event) => {
    const start = new Date(); start.setDate(start.getDate() + 7); start.setHours(0,0,0,0);
    const end = new Date(); end.setDate(end.getDate() + 7); end.setHours(23,59,59,999);
    
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '>=', admin.firestore.Timestamp.fromDate(start))
        .where('subscriptionEnd', '<=', admin.firestore.Timestamp.fromDate(end)).get();
    
    snapshot.forEach(doc => {
        transporter.sendMail({ 
            from: '"PalliCalc Billing" <pallicalc@gmail.com>', 
            to: doc.data().email, 
            subject: 'Subscription Expiring in 7 Days', 
            html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; max-width: 600px;">
                <h3 style="color: #333;">Subscription Renewal Reminder</h3>
                <p>Your PalliCalc subscription is expiring in 7 days.</p>
                <div style="background-color: #f0f8ff; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 5px solid #0d6efd;">
                    <strong>Commitment to Equitable Access</strong><br>
                    <small>PalliCalc is dedicated to supporting health institutions, non-profits, and hospices globally. Full and partial subsidies are available for eligible institutions. <a href="mailto:support@pallicalc.com">Contact us for assistance.</a></small>
                </div>
            </div>` 
        });
    });
});

// B. Month 11: Invoice Ready (30 Days Before Expiry)
exports.sendBillingNotice = onSchedule("every 24 hours", async (event) => {
    const now = new Date(); const target = new Date(); target.setDate(now.getDate() + 30); 
    const start = new Date(target.setHours(0,0,0,0)); const end = new Date(target.setHours(23,59,59,999));
    
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '>=', admin.firestore.Timestamp.fromDate(start))
        .where('subscriptionEnd', '<=', admin.firestore.Timestamp.fromDate(end)).get();
    
    snapshot.forEach(doc => {
        if (doc.data().billingStatus !== 'trial-free-lifetime') {
            transporter.sendMail({ 
                from: '"PalliCalc Billing" <pallicalc@gmail.com>', 
                to: doc.data().email, 
                subject: 'Invoice Ready: Renewal Due in 30 Days', 
                html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; max-width: 600px;">
                    <h3 style="color: #333;">Renewal Invoice Ready</h3>
                    <p>Your subscription is due for renewal in 30 days. The payment window is open.</p>
                    <div style="background-color: #f0f8ff; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 5px solid #0d6efd;">
                        <strong>Commitment to Equitable Access</strong><br>
                        <small>PalliCalc is dedicated to supporting health institutions, non-profits, and hospices globally. Full and partial subsidies are available for eligible institutions. <a href="mailto:support@pallicalc.com">Contact us for assistance.</a></small>
                    </div>
                </div>` 
            });
        }
    });
});

// C. Month 13 (Minus 1 Week): Final Warning
exports.checkGracePeriodWarning = onSchedule("every 24 hours", async (event) => {
    const now = new Date(); const target = new Date(); target.setDate(now.getDate() - 23); 
    const start = new Date(target.setHours(0,0,0,0)); const end = new Date(target.setHours(23,59,59,999));
    
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '>=', admin.firestore.Timestamp.fromDate(start))
        .where('subscriptionEnd', '<=', admin.firestore.Timestamp.fromDate(end))
        .where('billingStatus', '!=', 'suspended')
        .where('billingStatus', '!=', 'trial-free-lifetime').get();
    
    snapshot.forEach(doc => {
        transporter.sendMail({ 
            from: '"PalliCalc Billing" <pallicalc@gmail.com>', 
            to: doc.data().email, 
            subject: 'FINAL WARNING: Suspension in 7 Days', 
            html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #d9534f; max-width: 600px;">
                <h3 style="color: #d9534f;">Action Required Immediately</h3>
                <p>Your account is 23 days overdue. You are in the final week of your grace period.</p>
                <div style="background-color: #f0f8ff; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 5px solid #0d6efd;">
                    <strong>Commitment to Equitable Access</strong><br>
                    <small>PalliCalc is dedicated to supporting health institutions, non-profits, and hospices globally. Full and partial subsidies are available for eligible institutions. <a href="mailto:support@pallicalc.com">Contact us for assistance.</a></small>
                </div>
            </div>` 
        });
    });
});

// D. Month 13: Suspension Enforcer
exports.enforceSuspension = onSchedule("every 24 hours", async (event) => {
    const graceLimit = new Date(); graceLimit.setDate(graceLimit.getDate() - 30); 
    
    const snapshot = await admin.firestore().collection('users')
        .where('role', '==', 'institutionAdmin')
        .where('subscriptionEnd', '<', admin.firestore.Timestamp.fromDate(graceLimit))
        .where('billingStatus', '!=', 'suspended') 
        .get();
        
    const batch = admin.firestore().batch();
    
    snapshot.forEach(doc => {
        const data = doc.data();
        batch.update(doc.ref, { billingStatus: 'suspended' });
        if (data.institutionId) {
            batch.update(admin.firestore().collection('institutions').doc(data.institutionId), { status: 'suspended' });
        }
        transporter.sendMail({
            from: '"PalliCalc Billing" <pallicalc@gmail.com>',
            to: data.email,
            subject: 'ACCOUNT SUSPENDED: Activation Fee Now Applies',
            html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #d9534f; max-width: 600px;">
                <div style="background-color: #d9534f; color: white; padding: 15px; text-align: center;">
                    <h2 style="margin:0;">ACCOUNT SUSPENDED</h2>
                </div>
                <div style="padding: 20px;">
                    <p>Your 30-day renewal grace period has expired.</p>
                    <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 20px 0; color: #721c24;">
                        <strong>Penalty Applied:</strong><br>
                        To reactivate, you must pay the <strong>Annual Fee</strong> PLUS an <strong>Activation Penalty (RM 50 / $50 USD)</strong>.
                    </div>
                    <div style="background-color: #f0f8ff; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 5px solid #0d6efd;">
                        <strong>Commitment to Equitable Access</strong><br>
                        <small>PalliCalc is dedicated to supporting health institutions, non-profits, and hospices globally. <a href="mailto:support@pallicalc.com">Contact us for assistance.</a></small>
                    </div>
                </div>
            </div>
            `
        });
    });
    
    await batch.commit();
});

// --- 6. STAFF NOTIFICATION SYSTEM (Professional & Equitable) ---
exports.sendSuspensionReminder = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    
    const uid = request.auth.uid;
    
    // 1. Get the Staff User's Info
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    const userData = userDoc.data();
    const instId = userData.institutionId;
    
    if (!instId) throw new HttpsError('failed-precondition', 'No institution found.');

    // 2. Find the ONE Admin for this Institution
    const adminQuery = await admin.firestore().collection('users')
        .where('institutionId', '==', instId)
        .where('role', '==', 'institutionAdmin')
        .limit(1)
        .get();

    if (adminQuery.empty) throw new HttpsError('not-found', 'Admin email not found.');

    const adminDoc = adminQuery.docs[0].data();
    const adminEmail = adminDoc.email; 
    const instName = adminDoc.institutionName || "your institution";

    // 3. Send the Email
    await transporter.sendMail({
        from: '"PalliCalc Support" <pallicalc@gmail.com>',
        to: adminEmail,
        subject: `Service Update: Staff Access for ${instName}`,
        
        html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
            
            <div style="background-color: #f8f9fa; padding: 20px; border-bottom: 1px solid #e9ecef;">
                <h2 style="color: #343a40; margin: 0; font-size: 20px;">Service Update</h2>
            </div>

            <div style="padding: 30px;">
                <p style="font-size: 16px; color: #333; line-height: 1.6;">
                    <strong>Dear Admin,</strong>
                </p>
                <p style="font-size: 16px; color: #555; line-height: 1.6;">
                    We are writing to let you know that a member of your clinical team recently attempted to access PalliCalc's institutional features, but access is currently paused due to the subscription status.
                </p>
                
                <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; color: #777; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Access Attempt By</p>
                    <p style="margin: 5px 0 0 0; font-size: 16px; font-weight: 600; color: #333;">
                        ${userData.username || 'Staff Member'} 
                        <span style="font-weight: normal; color: #777; font-size: 14px;">(${userData.email})</span>
                    </p>
                </div>

                <div style="background-color: #e7f5ff; border-left: 4px solid #0d6efd; padding: 15px; margin: 25px 0;">
                    <p style="margin: 0 0 8px 0; font-weight: bold; color: #0d6efd; font-size: 15px;">
                        Commitment to Equitable Access
                    </p>
                    <p style="margin: 0; font-size: 14px; color: #495057; line-height: 1.5;">
                        PalliCalc is dedicated to supporting health institutions, non-profits, and hospices globally regardless of financial capacity. 
                        <strong>Full and partial subsidies are available</strong> for institutions facing budget constraints.
                    </p>
                </div>

                <p style="font-size: 16px; color: #555; line-height: 1.6;">
                    To restore access, you may renew the subscription via the dashboard, or contact us directly to discuss a fee waiver.
                </p>

                <div style="margin-top: 30px; text-align: left;">
                    <a href="https://pallicalc-eabdc.web.app/Admin/renewal.html" 
                       style="display: inline-block; background-color: #343a40; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: 500; font-size: 14px; margin-right: 10px;">
                       View Account Status
                    </a>
                    <a href="mailto:support@pallicalc.com?subject=Subsidy Request for ${instName}" 
                       style="display: inline-block; color: #0d6efd; padding: 10px 0; text-decoration: none; font-weight: 500; font-size: 14px;">
                       Contact Support for Assistance &rarr;
                    </a>
                </div>
            </div>

            <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #adb5bd; border-top: 1px solid #e9ecef;">
                <p style="margin: 0;">&copy; 2026 Alivioscript Solutions.</p>
            </div>
        </div>
        `
    });

    return { success: true };
});

// --- 7. SECURE USER STATUS CHECK ---
exports.getUserStatus = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const uid = request.auth.uid;
    const db = admin.firestore();
    
    try {
        // 1. Get User Profile
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'User profile not found.');
        }
        
        const userData = userDoc.data();
        let status = 'active';
        let institutionName = null;
        let customRatios = null;
        let isSuspended = false;

        // 2. Check Institution Status
        if (userData.institutionId) {
            const instDoc = await db.collection('institutions').doc(userData.institutionId).get();
            if (instDoc.exists) {
                const instData = instDoc.data();
                institutionName = instData.name;

                if (instData.status === 'suspended') {
                    status = 'suspended';
                    isSuspended = true;
                } else if (userData.role === 'institutionUser' && instData.customRatios) {
                    // Only return custom ratios if NOT suspended
                    customRatios = instData.customRatios;
                }
            }
        }

        // 3. Determine VIP Status
        const isVip = userData.billingStatus === 'trial-free-lifetime' || 
                      userData.billingStatus === 'active-first-year' || 
                      userData.role === 'institutionUser';

        return {
            role: userData.role,
            username: userData.username,
            institutionId: userData.institutionId,
            institutionName: institutionName,
            status: status,
            isSuspended: isSuspended,
            customRatios: customRatios,
            isVip: isVip,
            billingStatus: userData.billingStatus
        };

    } catch (error) {
        console.error("getUserStatus Error:", error);
        throw new HttpsError('internal', 'Unable to fetch user status.');
    }
});
