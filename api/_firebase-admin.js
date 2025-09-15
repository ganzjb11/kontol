// api/_firebase-admin.js
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { githubConfig } = require('../config.js');

if (!admin.apps.length) {
  try {
    const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) { console.error('Firebase admin initialization error.', error); }
}

const db = admin.firestore();
const auth = admin.auth();

async function isWebReseller(username) {
    const { username: owner, repoName } = githubConfig;
    const token = process.env.GITHUB_TOKEN; // <-- BACA DARI VERCEL

    if (!token) {
        console.error("GITHUB_TOKEN tidak ditemukan di Vercel Environment Variables.");
        return false;
    }
    const url = `https://api.github.com/repos/${owner}/${repoName}/contents/resellers.json`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3.raw' }
        });
        if (!response.ok) {
            console.error("Gagal mengambil data reseller dari GitHub.");
            return false;
        }
        const data = await response.json();
        return data.resellers.some(reseller => reseller.username === username.toLowerCase());
    } catch (error) {
        console.error("Error saat cek ke GitHub:", error);
        return false;
    }
}

async function verifyUser(req, requiredRole = 'user') {
    const { authorization } = req.headers;
    if (!authorization || !authorization.startsWith('Bearer ')) throw new Error('Unauthorized');
    
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error('User not found in Firestore.');
    
    const userData = userDoc.data();
    if (userData.banned && userData.role !== 'owner') throw new Error('User is banned.');
    
    let userRole = userData.role || 'user';
    
    if (userRole === 'user') {
        const isResellerInGithub = await isWebReseller(userData.username);
        if (isResellerInGithub) {
            userRole = 'web_reseller';
        }
    }
    
    const roles = ['user', 'reseller', 'web_reseller', 'owner'];
    if (roles.indexOf(userRole) < roles.indexOf(requiredRole)) {
        throw new Error(`Insufficient permissions. Your role: ${userRole}`);
    }
    
    return { uid, userDoc, userData };
}

module.exports = { db, auth, verifyUser };