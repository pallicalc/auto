import * as functions from "firebase-functions/v1"; // Use v1 for the trigger
import * as admin from "firebase-admin";

admin.initializeApp();

// This runs automatically every time a user signs up
export const onUserCreated = functions.auth.user().onCreate(async (user: any) => {
  const email = user.email || "";
  const uid = user.uid;

  console.log(`Checking new user: ${email}`);

  // 1. The Logic: Is this an MOH user?
  let isMOH = false;
  if (email.toLowerCase().endsWith("@moh.gov.my")) {
    isMOH = true;
  }

  // 2. The Data: Prepare the profile
  const userUpdates = {
    email: email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    isPremium: isMOH,
    userType: isMOH ? "moh" : "public",
    // Non-MOH users get 12 months free. MOH users have no expiry.
    freeUntil: isMOH ? null : admin.firestore.Timestamp.fromDate(new Date(new Date().setFullYear(new Date().getFullYear() + 1)))
  };

  // 3. The Save: Push to Firestore Database
  try {
    await admin.firestore().collection("users").doc(uid).set(userUpdates, { merge: true });
    console.log(`Success! User ${email} is set to ${isMOH ? "Premium" : "Free"}.`);
  } catch (error) {
    console.error("Error creating user profile:", error);
  }
});