const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const v1 = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// --- 1. EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "pallicalc@gmail.com",
    pass: "ciae ltpa guxy folb"
  }
});

// --- 2. HTTP APIs (Gen 2) ---

exports.requestTransferLink = onRequest({ cors: true }, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Token' });
    }
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
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not Logged In' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      const { newEmail, newPassword } = req.body;

      await admin.auth().updateUser(uid, { email: newEmail, password: newPassword, emailVerified: true });
      await admin.firestore().collection('users').doc(uid).update({
        email: newEmail,
        role: 'institutionAdmin',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// --- 3. THE GRIM REAPER (Gen 2) ---
exports.checkGracePeriods = onSchedule("every 24 hours", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const expiredUsersSnapshot = await admin.firestore().collection('users')
        .where('gracePeriodEnd', '<=', now)
        .get();

    const deletePromises = [];
    expiredUsersSnapshot.forEach(doc => {
        const uid = doc.id;
        console.log(`Time is up for user: ${uid}. Deleting account.`);
        deletePromises.push(admin.auth().deleteUser(uid));
    });

    await Promise.all(deletePromises);
});

// --- 4. THE COUNTER (FIXED FOR YOUR DB) ---
exports.onUserCreated = onDocumentCreated("users/{userId}", async (event) => {
    const newData = event.data.data();

    // FIXED: Use 'institutionId' (not 'institution')
    const institutionId = newData.institutionId;

    // OPTIONAL: Auto-fix null names if possible (helps your UI)
    if (institutionId && !newData.institutionName) {
         const instDoc = await admin.firestore().collection('institutions').doc(institutionId).get();
         if (instDoc.exists) {
             await event.data.ref.update({ institutionName: instDoc.data().name });
         }
    }

    if (institutionId) {
        const institutionRef = admin.firestore().collection('institutions').doc(institutionId);
        // FIXED: Update 'memberCount' (not 'staffCount')
        await institutionRef.update({
            memberCount: admin.firestore.FieldValue.increment(1)
        });
    }
});

// --- 5. THE CLEANER (FIXED FOR YOUR DB) ---
exports.onUserDeleted = v1.auth.user().onDelete(async (user) => {
    console.log(`User ${user.uid} deleted from Auth. Cleaning up...`);

    const userDoc = await admin.firestore().collection('users').doc(user.uid).get();

    if (userDoc.exists) {
        const userData = userDoc.data();
        // FIXED: Use 'institutionId'
        const institutionId = userData.institutionId;

        if (institutionId) {
            const institutionRef = admin.firestore().collection('institutions').doc(institutionId);
            // FIXED: Update 'memberCount'
            await institutionRef.update({
                memberCount: admin.firestore.FieldValue.increment(-1)
            }).catch(err => console.log("Could not update count:", err));
        }

        await userDoc.ref.delete();
    }
});