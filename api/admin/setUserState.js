// api/admin/setUserState.js
const { db, auth, verifyUser } = require('../_firebase-admin.js');

module.exports = async (req, res) => {
    try {
        // Izinkan web_reseller mengakses endpoint ini
        const { userData } = await verifyUser(req, 'web_reseller');
        const loggedInUserRole = userData.role;

        const { username, role, banned } = req.body;
        
        if (!username) {
            return res.status(400).json({ message: 'Username is required.' });
        }

        // --- LOGIKA PEMBATASAN UNTUK RESELLER WEB ---
        if (loggedInUserRole === 'web_reseller') {
            // 1. Reseller web DILARANG melakukan ban atau unban
            if (banned !== undefined) {
                return res.status(403).json({ message: 'Akses ditolak. Anda tidak punya izin untuk ban/unban user.' });
            }
            // 2. Reseller web DILARANG mengangkat user menjadi web_reseller atau owner
            if (role === 'web_reseller' || role === 'owner') {
                return res.status(403).json({ message: 'Akses ditolak. Anda tidak bisa mengangkat user ke role ini.' });
            }
        }
        // --- Akhir Logika Pembatasan ---
        
        const usersRef = db.collection('users');
        const q = usersRef.where('username', '==', username.toLowerCase());
        const querySnapshot = await q.get();
        
        if (querySnapshot.empty) {
            return res.status(404).json({ message: `User '${username}' not found.` });
        }
        
        const userDoc = querySnapshot.docs[0];
        const updateData = {};
        
        if (role !== undefined) {
            updateData.role = role;
        }
        if (banned !== undefined) {
             updateData.banned = banned;
             await auth.updateUser(userDoc.id, { disabled: banned });
        }
        
        if (Object.keys(updateData).length > 0) {
            await userDoc.ref.update(updateData);
        }
        
        res.status(200).json({ message: `Status user ${username} berhasil diupdate.` });

    } catch (error) {
        console.error('CRASH di setUserState:', error);
        res.status(500).json({ message: error.message });
    }
};