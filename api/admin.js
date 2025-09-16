// api/admin.js
const { pterodactylConfig, telegramConfig } = require('../config.js');
const { db, auth, verifyUser } = require('./_firebase-admin.js');
const fetch = require('node-fetch');

async function fetchAllPterodactylData(initialUrl, apiKey) {
    let allData = [];
    let url = initialUrl;

    while (url) {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.errors ? data.errors[0].detail : `Gagal mengambil data dari ${url}`);
        }

        allData = allData.concat(data.data);
        // Cek apakah ada halaman berikutnya di link pagination
        url = data.meta.pagination.links ? data.meta.pagination.links.next : null;
        if(url) {
            // Hapus duplikasi base URL jika ada
            if (!url.startsWith('http')) {
                const baseDomain = new URL(initialUrl).origin;
                url = new URL(url, baseDomain).href;
            }
            await new Promise(resolve => setTimeout(resolve, 250)); // Jeda antar request
        }
    }
    return allData;
}

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
        const { domain, apiKey, safeUsers } = pterodactylConfig;

        switch (action) {
            case 'getAllUsers': {
                if (loggedInUserRole !== 'owner' && loggedInUserRole !== 'reseller_apk') {
                    return res.status(403).json({ message: 'Akses ditolak.' });
                }
                const usersSnapshot = await db.collection('users').get();
                const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                return res.status(200).json(users);
            }

            case 'setUserState': {
                if (loggedInUserRole !== 'owner' && loggedInUserRole !== 'reseller_apk') {
                    return res.status(403).json({ message: 'Akses ditolak.' });
                }
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

            case 'createCoupon': {
                if (loggedInUserRole !== 'owner') {
                    return res.status(403).json({ message: 'Hanya owner yang bisa membuat kupon.' });
                }
                const { code, capacity, rewardRam } = payload;
                if (!code || !capacity || !rewardRam) {
                    return res.status(400).json({ message: 'Data kupon tidak lengkap.' });
                }

                const couponCode = code.toUpperCase();
                const couponRef = db.collection('coupons').doc(couponCode);
                const doc = await couponRef.get();

                if (doc.exists) {
                    return res.status(400).json({ message: `Kupon dengan kode '${couponCode}' sudah ada.` });
                }

                await couponRef.set({
                    code: couponCode,
                    capacity: parseInt(capacity, 10),
                    rewardRam: rewardRam,
                    redeemedBy: [], // Array untuk menyimpan UID user yang sudah redeem
                    createdAt: new Date(),
                });

                return res.status(201).json({ message: `Kupon '${couponCode}' berhasil dibuat!` });
            }

            case 'getAllServers': {
                if (loggedInUserRole !== 'owner') return res.status(403).json({ message: 'Hanya owner yang bisa melihat semua server.' });
                const allServers = await fetchAllPterodactylData(`${domain}/api/application/servers?include=user`, apiKey);
                return res.status(200).json(allServers);
            }

            case 'deleteServer': {
                if (loggedInUserRole !== 'owner') return res.status(403).json({ message: 'Hanya owner yang bisa menghapus server.' });
                const { serverId } = payload;
                if (!serverId) return res.status(400).json({ message: "Server ID wajib diisi." });
                const response = await fetch(`${domain}/api/application/servers/${serverId}/force`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${apiKey}` } });
                if (response.status !== 204) throw new Error("Gagal menghapus server dari Pterodactyl.");
                return res.status(200).json({ message: `Server ID ${serverId} berhasil dihapus.` });
            }

            case 'clearAllServers': {
                if (loggedInUserRole !== 'owner') return res.status(403).json({ message: 'Hanya owner yang bisa clear all servers.' });
                
                const allServers = await fetchAllPterodactylData(`${domain}/api/application/servers?include=user`, apiKey);
                
                const serversToDelete = allServers.filter(server => {
                    const owner = server.attributes.relationships.user.attributes;
                    return !safeUsers.includes(owner.id) && !safeUsers.includes(owner.email);
                });

                if (serversToDelete.length === 0) return res.status(200).json({ message: "Tidak ada server yang perlu dihapus." });

                const userIdsToDelete = [...new Set(serversToDelete.map(server => server.attributes.user))];
                let deletedServersCount = 0;
                let deletedUsersCount = 0;

                for (const server of serversToDelete) {
                    await fetch(`${domain}/api/application/servers/${server.attributes.id}/force`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${apiKey}` } });
                    deletedServersCount++;
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                
                for (const userId of userIdsToDelete) {
                    const isSafe = safeUsers.includes(userId);
                    if (!isSafe) {
                        try {
                            const userDeleteRes = await fetch(`${domain}/api/application/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${apiKey}` } });
                            if(userDeleteRes.ok) deletedUsersCount++;
                            await new Promise(resolve => setTimeout(resolve, 200));
                        } catch(e) { console.error(`Gagal hapus user ${userId}, mungkin sudah terhapus.`); }
                    }
                }
                
                return res.status(200).json({ message: `${deletedServersCount} server & ${deletedUsersCount} user terkait berhasil di-clear.` });
            }

            case 'clearAllUsers': {
                if (loggedInUserRole !== 'owner') return res.status(403).json({ message: 'Hanya owner yang bisa clear all users.' });
                
                const allUsers = await fetchAllPterodactylData(`${domain}/api/application/users`, apiKey);
                
                const usersToDelete = allUsers.filter(user => {
                    const attrs = user.attributes;
                    return !safeUsers.includes(attrs.id) && !safeUsers.includes(attrs.email);
                });

                if (usersToDelete.length === 0) return res.status(200).json({ message: "Tidak ada user Pterodactyl yang perlu dihapus." });

                for (const user of usersToDelete) {
                    await fetch(`${domain}/api/application/users/${user.attributes.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${apiKey}` } });
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                return res.status(200).json({ message: `${usersToDelete.length} user Pterodactyl berhasil di-clear.` });
            }

            default:
                return res.status(400).json({ message: 'Aksi tidak diketahui.' });
        }
    } catch (error) {
        console.error(`Error di API Admin, Aksi: ${req.body.action || 'unknown'}`, error);
        res.status(500).json({ message: error.message });
    }
};