const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const cors = require('cors')({origin: true}); 

admin.initializeApp();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "pallicalc@gmail.com",
    pass: "ciae ltpa guxy folb" 
  }
});

// 1. Send Professional Email
exports.requestTransferLink = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Token' });
    }
    const idToken = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const email = decodedToken.email;
      const uid = decodedToken.uid;

      // Generate Secure Token
      const customToken = await admin.auth().createCustomToken(uid);
      const pageLink = `https://pallicalc-eabdc.web.app/transfer-complete.html`;

      // PROFESSIONAL DESIGN
      await transporter.sendMail({
        from: '"PalliCalc Security" <pallicalc@gmail.com>',
        to: email,
        subject: 'Security Code: Admin Transfer Request',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f4f7f6; padding: 20px; margin: 0;">
            
            <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              
              <div style="background-color: #0d6efd; padding: 30px 20px; text-align: center;">
                <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Secure Transfer</h2>
                <p style="color: #e0e7ff; margin: 5px 0 0; font-size: 14px;">Identity Verification Required</p>
              </div>

              <div style="padding: 30px;">
                <p style="color: #333; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 25px;">
                  You have initiated a transfer of ownership for the <strong>Institution Admin</strong> account.
                </p>

                <div style="background: #f8f9fa; border-left: 4px solid #0d6efd; padding: 15px; margin-bottom: 25px;">
                  <p style="margin: 0; font-size: 13px; color: #555;"><strong>Step 1:</strong> Copy the code below.</p>
                  <p style="margin: 5px 0 0; font-size: 13px; color: #555;"><strong>Step 2:</strong> Click the button to verify.</p>
                </div>

                <p style="font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 8px;">Your Access Code:</p>

                <div style="
                    background-color: #f1f3f5; 
                    border: 1px solid #dee2e6; 
                    border-radius: 6px; 
                    padding: 12px; 
                    height: 60px;              /* Small fixed height */
                    overflow-y: auto;          /* Scrollable */
                    font-family: 'Courier New', monospace; 
                    font-size: 12px; 
                    color: #495057; 
                    word-break: break-all;
                    margin-bottom: 30px;
                    -webkit-user-select: all;
                    user-select: all;">
${customToken}</div>

                <div style="text-align: center;">
                  <a href="${pageLink}" style="
                      background-color: #198754; 
                      color: white; 
                      padding: 14px 35px; 
                      text-decoration: none; 
                      border-radius: 50px; 
                      font-weight: 600; 
                      font-size: 16px;
                      display: inline-block;
                      box-shadow: 0 4px 6px rgba(25, 135, 84, 0.2);">
                    Verify Identity Now
                  </a>
                </div>
              </div>

              <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                <p style="color: #aaa; font-size: 11px; margin: 0;">This code expires in 60 minutes.</p>
              </div>

            </div>
          </body>
          </html>
        `
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
});

// 2. Manual Master Key (Standard)
exports.completeAdminTransfer = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
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
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
});