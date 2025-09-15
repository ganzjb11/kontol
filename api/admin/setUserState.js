// api/admin/setUserState.js
const { db, auth, verifyUser } = require('../_firebase-admin.js');
const { telegramConfig } = require('../../config.js');
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
        inline_keyboard: [
            [
                { text: "✅ Konfirmasi", callback_data: `approve:${requestData.id}` },
                { text: "❌ Batalkan", callback_data: `reject:${requestData.id}` }
            ]
        ]
    };

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: ownerChatId,
            text: message,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        })
    });

    if (!response.ok) {
        console.error("Gagal mengirim notifikasi Telegram:", await response.text());
        throw new Error("Gagal mengirim notifikasi ke owner.");
    }
}

module.exports = async (req, res) => {
    try {
        const { uid: initiatorUid, userData } = await verifyUser(req, 'reseller_apk');
        const loggedInUserRole = userData.role;
        const { username: targetUsername, role: newRole, banned } = req.body;
        
        if (!targetUsername) return res.status(400).json({ message: 'Username target wajib diisi.' });

        const usersRef = db.collection('users');
        const q = usersRef.where('username', '==', targetUsername.toLowerCase());
        const querySnapshot = await q.get();
        if (querySnapshot.empty) return res.status(404).json({ message: `User '${targetUsername}' tidak ditemukan.` });
        
        const targetUserDoc = querySnapshot.docs[0];
        const targetUserData = targetUserDoc.data();

        if (loggedInUserRole === 'reseller_apk') {
            if (banned !== undefined) return res.status(403).json({ message: 'Akses ditolak. Anda tidak bisa ban/unban.' });
            if (newRole === 'reseller_apk' || newRole === 'owner') return res.status(403).json({ message: 'Akses ditolak. Anda tidak bisa mengangkat ke role ini.' });

            if (newRole === 'reseller' || newRole === 'user') {
                const requestRef = db.collection('roleChangeRequests').doc();
                const requestData = {
                    id: requestRef.id,
                    initiatorUid: initiatorUid,
                    initiatorUsername: userData.username,
                    targetUid: targetUserDoc.id,
                    targetUsername: targetUserData.username,
                    currentRole: targetUserData.role,
                    newRole: newRole,
                    status: 'pending',
                    createdAt: new Date()
                };
                await requestRef.set(requestData);
                await sendTelegramNotification(requestData);
                return res.status(200).json({ message: `Permintaan untuk mengubah role ${targetUsername} telah dikirim. Menunggu konfirmasi owner.` });
            }
        }
        
        if (loggedInUserRole === 'owner') {
            const updateData = {};
            if (newRole !== undefined) updateData.role = newRole === 'reseller_apk' ? 'reseller_apk' : newRole;
            if (banned !== undefined) {
                 updateData.banned = banned;
                 await auth.updateUser(targetUserDoc.id, { disabled: banned });
            }
            if (Object.keys(updateData).length > 0) await targetUserDoc.ref.update(updateData);
            return res.status(200).json({ message: `Status user ${targetUsername} berhasil diupdate.` });
        }
        
        res.status(403).json({ message: 'Aksi tidak diizinkan.' });

    } catch (error) {
        console.error('CRASH di setUserState:', error);
        res.status(500).json({ message: error.message });
    }
};