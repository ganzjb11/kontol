// api/admin/setUserState.js
const { db, auth, verifyUser } = require('../_firebase-admin.js');
const { githubConfig } = require('../../config.js');
const fetch = require('node-fetch');

async function updateWebResellersInGithub(targetUsername, password, action = 'add') {
    const { username: owner, repoName } = githubConfig;
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN tidak di-set di Vercel Environment Variables.");
    
    const filePath = 'resellers.json';
    const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`;
    
    const fileResponse = await fetch(url, { headers: { 'Authorization': `token ${token}` } });
    if (!fileResponse.ok) {
        throw new Error("File resellers.json tidak ditemukan di repo atau GITHUB_TOKEN salah.");
    }
    const fileData = await fileResponse.json();
    const sha = fileData.sha;
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const data = JSON.parse(content);

    const usernameLower = targetUsername.toLowerCase();
    const userIndex = data.resellers.findIndex(r => r.username === usernameLower);

    if (action === 'add') {
        if (userIndex > -1) {
            data.resellers[userIndex].password = password;
        } else {
            data.resellers.push({ username: usernameLower, password: password });
        }
    } else if (action === 'remove') {
        if (userIndex > -1) {
            data.resellers.splice(userIndex, 1);
        } else {
            return; // Tidak ada yang perlu dihapus
        }
    }

    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const updateResponse = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
        body: JSON.stringify({
            message: `Update web resellers: ${action} ${targetUsername}`,
            content: newContent,
            sha: sha
        })
    });

    if (!updateResponse.ok) {
        throw new Error("Gagal mengupdate file di GitHub. Pastikan TOKEN punya scope 'repo'.");
    }
}


module.exports = async (req, res) => {
    try {
        await verifyUser(req, 'owner');
        const { username, role, banned, password } = req.body;
        if (!username) {
            return res.status(400).json({ message: 'Username is required.' });
        }
        
        if (role === 'web_reseller') {
            if (!password) {
                return res.status(400).json({ message: 'Password untuk reseller web wajib diisi.' });
            }
            await updateWebResellersInGithub(username, password, 'add');
            
            const userDocQuery = await db.collection('users').where('username', '==', username.toLowerCase()).get();
            if (!userDocQuery.empty) {
                await userDocQuery.docs[0].ref.update({ role: 'web_reseller' });
            }
            return res.status(200).json({ message: `User ${username} berhasil ditambahkan sebagai Reseller Web.` });
        }
        
        // Jika role diubah menjadi user/reseller, hapus dari daftar web_reseller di GitHub
        if (role === 'user' || role === 'reseller') {
            await updateWebResellersInGithub(username, null, 'remove');
        }
        
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