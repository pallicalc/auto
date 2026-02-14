import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();

// =========================================================
// ROBOT 1: THE MOH DETECTIVE (Auth Trigger)
// Runs when a user creates an account email/password.
// =========================================================
export const onUserCreated = functions.auth.user().onCreate(async (user: any) => {
  const email = user.email || "";
  const uid = user.uid;

  // console.log(`[Auth] Checking new user: ${email}`);

  // 1. Is this an MOH user?
  let isMOH = false;
  if (email.toLowerCase().endsWith("@moh.gov.my")) {
    isMOH = true;
  }

  // 2. Prepare the profile data
  const userUpdates = {
    email: email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    isPremium: isMOH,
    userType: isMOH ? "moh" : "public",
    freeUntil: isMOH ? null : admin.firestore.Timestamp.fromDate(new Date(new Date().setFullYear(new Date().getFullYear() + 1)))
  };

  // 3. Save to Database
  try {
    await admin.firestore().collection("users").doc(uid).set(userUpdates, { merge: true });
    // console.log(`[Auth] Success! User ${email} is set to ${isMOH ? "Premium" : "Free"}.`);
  } catch (error) {
    console.error("[Auth] Error creating user profile:", error);
  }
});

// =========================================================
// ROBOT 2: THE HEADCOUNT COUNTER (Database Trigger)
// Runs when the user's data file is written or updated.
// =========================================================
export const onUserJoinedHospital = functions.firestore.document('users/{userId}').onWrite(async (change, context) => {
  const newData = change.after.exists ? change.after.data() : null;
  const oldData = change.before.exists ? change.before.data() : null;

  // SCENARIO 1: A user JOINED a hospital
  // (They have an institutionId now, but they didn't before)
  const newInstId = newData?.institutionId;
  const oldInstId = oldData?.institutionId;

  if (newInstId && newInstId !== oldInstId) {
    // console.log(`[DB] User joined hospital ${newInstId}. Incrementing count.`);
    await admin.firestore().collection("institutions").doc(newInstId).update({
      memberCount: admin.firestore.FieldValue.increment(1)
    });
  }

  // SCENARIO 2: A user LEFT a hospital (or was deleted)
  // (They had an institutionId before, but not anymore)
  if (oldInstId && newInstId !== oldInstId) {
    // console.log(`[DB] User left hospital ${oldInstId}. Decrementing count.`);
    await admin.firestore().collection("institutions").doc(oldInstId).update({
      memberCount: admin.firestore.FieldValue.increment(-1)
    });
  }
});