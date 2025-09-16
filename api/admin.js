// api/admin.js
const { pterodactylConfig } = require('../config.js');
const { db, auth, verifyUser } = require('./_firebase-admin.js');
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
        const { uid: initiatorUid, userData } = await verifyUser(req, 'reseller_apk');
        const loggedInUserRole = userData.role;

        switch (action) {
            case 'getAllUsers': {
                const usersSnapshot = await db.collection('users').get();
                const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                return res.status(200).json(users);
            }

            case 'setUserState': {
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

            case 'getAllServers': {
                if (loggedInUserRole !== 'owner') return res.status(403).json({ message: 'Hanya owner yang bisa melihat semua server.' });
                const { domain, apiKey } = pterodactylConfig;
                const response = await fetch(`${domain}/api/application/servers?include=user`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                const data = await response.json();
                if (!response.ok) throw new Error(data.errors ? data.errors[0].detail : "Gagal fetch servers");
                return res.status(200).json(data.data);
            }

            case 'deleteServer': {
                if (loggedInUserRole !== 'owner') return res.status(403).json({ message: 'Hanya owner yang bisa menghapus server.' });
                const { serverId } = payload;
                if (!serverId) return res.status(400).json({ message: "Server ID wajib diisi." });
                const { domain, apiKey } = pterodactylConfig;
                const response = await fetch(`${domain}/api/application/servers/${serverId}/force`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${apiKey}` } });
                if (response.status !== 204) throw new Error("Gagal menghapus server dari Pterodactyl.");
                return res.status(200).json({ message: `Server ID ${serverId} berhasil dihapus.` });
            }

            case 'clearAllServers': {
                if (loggedInUserRole !== 'owner') return res.status(403).json({ message: 'Hanya owner yang bisa clear all servers.' });
                const { domain, apiKey, safeUsers } = pterodactylConfig;
                const serverRes = await fetch(`${domain}/api/application/servers?include=user`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                const serverData = await serverRes.json();
                if (!serverRes.ok) throw new Error("Gagal mengambil daftar server.");
                const serversToDelete = serverData.data.filter(server => {
                    const owner = server.attributes.relationships.user.attributes;
                    return !safeUsers.includes(owner.id) && !safeUsers.includes(owner.email);
                });
                if (serversToDelete.length === 0) return res.status(200).json({ message: "Tidak ada server yang perlu dihapus." });
                for (const server of serversToDelete) {
                    await fetch(`${domain}/api/application/servers/${server.attributes.id}/force`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${apiKey}` } });
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                return res.status(200).json({ message: `${serversToDelete.length} server berhasil di-clear.` });
            }

            default:
                return res.status(400).json({ message: 'Aksi tidak diketahui.' });
        }
    } catch (error) {
        console.error(`Error di API Admin, Aksi: ${req.body.action}`, error);
        res.status(500).json({ message: error.message });
    }
};