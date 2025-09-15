// api/_firebase-admin.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        throw new Error("Kunci FIREBASE_SERVICE_ACCOUNT_KEY tidak ditemukan di Vercel Environment Variables.");
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Firebase admin initialization error.', error);
  }
}

const db = admin.firestore();
const auth = admin.auth();

async function verifyUser(req, requiredRole = 'user') {
    const { authorization } = req.headers;
    if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new Error('Unauthorized: No token provided.');
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
        throw new Error('User not found in Firestore.');
    }
    const userData = userDoc.data();
    if (userData.banned && userData.role !== 'owner') {
        throw new Error('User is banned.');
    }
    const userRole = userData.role || 'user';
    const roles = ['user', 'reseller', 'owner'];
    if (roles.indexOf(userRole) < roles.indexOf(requiredRole)) {
        throw new Error('Insufficient permissions.');
    }
    return { uid, userDoc, userData };
}

module.exports = { db, auth, verifyUser };