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
    pass: "iwsh izyr ledc tldk" // Your working App Password
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

// --- 3. THE GRIM REAPER (Deletes Account when time is up) ---
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

// --- 4. NEW: DETAILED REMOVAL NOTIFICATION ---
exports.notifyStaffRemoval = onDocumentUpdated("users/{userId}", async (event) => {
    const newData = event.data.after.data();
    const email = newData.email;
    const userName = newData.username || "Staff Member";
    const institutionName = newData.institutionName || "your institution";
    
    // Check if a deletion date exists
    const isNowScheduled = newData.gracePeriodEnd;

    console.log(`Update detected for ${email}. Date found: ${isNowScheduled}`);

    if (isNowScheduled) {
        // Format the Date (e.g., "9 February 2026")
        const dateObj = isNowScheduled.toDate();
        const dateString = dateObj.toLocaleDateString("en-GB", { 
            day: 'numeric', month: 'long', year: 'numeric' 
        });

        console.log(`Sending DETAILED email to ${email}...`);

        try {
            await transporter.sendMail({
                from: '"PalliCalc Admin" <pallicalc@gmail.com>',
                to: email,
                subject: `Account Removal Notice - ${institutionName}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                        
                        <div style="background-color: #d9534f; padding: 20px; text-align: center;">
                            <h2 style="color: white; margin: 0;">Account Removal Notice</h2>
                        </div>

                        <div style="padding: 30px;">
                            <p style="font-size: 16px; color: #333;">Dear <strong>${userName}</strong>,</p>
                            
                            <p style="font-size: 16px; color: #555; line-height: 1.5;">
                                This is a notification that your access to the <strong>${institutionName}</strong> PalliCalc dashboard has been scheduled for removal.
                            </p>

                            <div style="background-color: #fff3cd; border-left: 5px solid #ffc107; padding: 15px; margin: 20px 0;">
                                <p style="margin: 0; color: #856404; font-weight: bold;">Scheduled Deletion Date:</p>
                                <p style="margin: 5px 0 0 0; font-size: 20px; color: #333;">${dateString}</p>
                            </div>

                            <p style="font-size: 14px; color: #777;">
                                You will retain full access to your account until the date above. If you believe this action was taken in error, please contact your institution administrator immediately.
                            </p>
                        </div>

                        <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #999;">
                            <p style="margin: 0;">© 2026 Alivioscript Solutions</p>
                            <p style="margin: 0;">Automated System Message</p>
                        </div>
                    </div>
                `
            });
            console.log(`✅ Detailed email sent to ${email}`);
        } catch (error) {
            console.error("❌ Error sending email:", error);
        }
    }
});

// --- 5. THE COUNTER ---
exports.onUserCreated = onDocumentCreated("users/{userId}", async (event) => {
    const newData = event.data.data();
    const institutionId = newData.institutionId;

    if (institutionId && !newData.institutionName) {
         const instDoc = await admin.firestore().collection('institutions').doc(institutionId).get();
         if (instDoc.exists) {
             await event.data.ref.update({ institutionName: instDoc.data().name });
         }
    }

    if (institutionId) {
        const institutionRef = admin.firestore().collection('institutions').doc(institutionId);
        await institutionRef.update({
            memberCount: admin.firestore.FieldValue.increment(1)
        });
    }
});

// --- 6. THE CLEANER ---
exports.onUserDeleted = v1.auth.user().onDelete(async (user) => {
    console.log(`User ${user.uid} deleted from Auth. Cleaning up...`);

    const userDoc = await admin.firestore().collection('users').doc(user.uid).get();

    if (userDoc.exists) {
        const userData = userDoc.data();
        const institutionId = userData.institutionId;

        if (institutionId) {
            const institutionRef = admin.firestore().collection('institutions').doc(institutionId);
            await institutionRef.update({
                memberCount: admin.firestore.FieldValue.increment(-1)
            }).catch(err => console.log("Could not update count:", err));
        }

        await userDoc.ref.delete();
    }
});

// --- 7. THE DEBUGGER (KEEP THIS!) ---
// Useful for future troubleshooting
exports.testEmailConnection = onRequest({ cors: true }, async (req, res) => {
    const testRecipient = "chai.alison@gmail.com"; 

    try {
        await transporter.verify(); 
        console.log("Login Successful");

        await transporter.sendMail({ 
            from: '"PalliCalc Test" <pallicalc@gmail.com>',
            to: testRecipient,
            subject: 'Test Email Connection - Success!',
            html: '<h1>It Works!</h1><p>Your email configuration is correct.</p>'
        });

        res.status(200).send(`SUCCESS! Email sent to ${testRecipient}`);
    } catch (error) {
        res.status(500).send(`FAILED: ${error.message}`);
    }
});