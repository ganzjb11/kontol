// api/reseller/setUserRole.js
const { db, verifyUser } = require('../_firebase-admin.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
    try {
        const { uid, userData } = await verifyUser(req, 'web_reseller');
        const { username, role } = req.body;
        if (!username || !role) return res.status(400).json({ message: 'Username dan role wajib diisi.' });
        if (role === 'owner' || role === 'web_reseller') return res.status(403).json({ message: 'Anda tidak bisa mengangkat role ini.' });
        const usersRef = db.collection('users');
        let q;
        if (userData.role === 'owner') {
             q = usersRef.where('username', '==', username.toLowerCase());
        } else {
             q = usersRef.where('username', '==', username.toLowerCase()).where('addedBy', '==', uid);
        }
        const querySnapshot = await q.get();
        if (querySnapshot.empty) return res.status(404).json({ message: 'User tidak ditemukan atau bukan milik Anda.' });
        const userDoc = querySnapshot.docs[0];
        await userDoc.ref.update({ role });
        res.status(200).json({ message: `User ${username} berhasil diubah menjadi ${role}.` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};