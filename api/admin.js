// api/admin.js
const { pterodactylConfig, telegramConfig } = require('../config.js');
const { db, auth, verifyUser } = require('./_firebase-admin.js');
const fetch = require('node-fetch');

async function sendTelegramNotification(requestData) {
    const { botToken, ownerChatId } = telegramConfig;
    if (!botToken || !ownerChatId) {
        console.error("Telegram token atau chat ID tidak di-set di Vercel!");
        throw new Error("Konfigurasi Telegram tidak lengkap di sisi server.");
    }
    const actionText = requestData.newRole === 'reseller' ? 'menjadi Reseller Panel' : 'mencabut role Reseller Panel';
    const message = `
🔔 **Permintaan Perubahan Role Baru**
-----------------------------------
**Dari Reseller APK:** \`${requestData.initiatorUsername}\`
**Ingin mengubah user:** \`${requestData.targetUsername}\`
**Aksi:** ${actionText}
-----------------------------------
Mohon konfirmasi atau batalkan permintaan ini.
    `;
    const keyboard = {
        inline_keyboard: [[
            { text: "✅ Konfirmasi", callback_data: `approve:${requestData.id}` },
            { text: "❌ Batalkan", callback_data: `reject:${requestData.id}` }
        ]]
    };
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ownerChatId, text: message, parse_mode: 'Markdown', reply_markup: keyboard })
    });
    if (!response.ok) {
        console.error("Gagal mengirim notifikasi Telegram:", await response.text());
        throw new Error("Gagal mengirim notifikasi ke owner.");
    }
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    try {
        const { action, payload } = req.body;
        const { uid: initiatorUid, userData } = await verifyUser(req);
        const loggedInUserRole = userData.role;

        switch (action) {
            case 'getAllUsers': {
                if (loggedInUserRole !== 'owner' && loggedInUserRole !== 'reseller_apk') return res.status(403).json({ message: 'Akses ditolak.' });
                const usersSnapshot = await db.collection('users').get();
                const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                return res.status(200).json(users);
            }

            case 'setUserState': {
                if (loggedInUserRole !== 'owner' && loggedInUserRole !== 'reseller_apk') return res.status(403).json({ message: 'Akses ditolak.' });
                const { username: targetUsername, role: newRole, banned } = payload;
                if (!targetUsername) return res.status(400).json({ message: 'Username target wajib diisi.' });

                const usersRef = db.collection('users');
                const q = usersRef.where('username', '==', targetUsername.toLowerCase());
                const querySnapshot = await q.get();
                if (querySnapshot.empty) return res.status(404).json({ message: `User '${targetUsername}' tidak ditemukan.` });
                
                const targetUserDoc = querySnapshot.docs[0];

                if (loggedInUserRole === 'reseller_apk') {
                    if (banned !== undefined) return res.status(403).json({ message: 'Akses ditolak. Anda tidak bisa ban/unban.' });
                    if (newRole === 'reseller_apk' || newRole === 'owner') return res.status(403).json({ message: 'Akses ditolak. Anda tidak bisa mengangkat ke role ini.' });
                    
                    const requestRef = db.collection('roleChangeRequests').doc();
                    const requestData = { id: requestRef.id, initiatorUid, initiatorUsername: userData.username, targetUid: targetUserDoc.id, targetUsername: targetUserDoc.data().username, currentRole: targetUserDoc.data().role, newRole, status: 'pending', createdAt: new Date() };
                    await requestRef.set(requestData);
                    await sendTelegramNotification(requestData);
                    return res.status(200).json({ message: `Permintaan untuk mengubah role ${targetUsername} telah dikirim.` });
                }
                
                if (loggedInUserRole === 'owner') {
                    const updateData = {};
                    if (newRole !== undefined) updateData.role = newRole;
                    if (banned !== undefined) {
                         updateData.banned = banned;
                         await auth.updateUser(targetUserDoc.id, { disabled: banned });
                    }
                    if (Object.keys(updateData).length > 0) await targetUserDoc.ref.update(updateData);
                    return res.status(200).json({ message: `Status user ${targetUsername} berhasil diupdate.` });
                }

                return res.status(403).json({ message: 'Aksi tidak diizinkan.' });
            }

            // ... (case lain seperti getAllServers, deleteServer, dll. sama seperti sebelumnya)

            default:
                return res.status(400).json({ message: 'Aksi tidak diketahui.' });
        }
    } catch (error) {
        console.error(`Error di API Admin, Aksi: ${req.body.action || 'unknown'}`, error);
        res.status(500).json({ message: error.message });
    }
};
