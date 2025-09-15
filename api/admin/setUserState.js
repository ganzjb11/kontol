// api/admin/setUserState.js
const fetch = require('node-fetch');

// Pindahkan require ke dalam try-catch untuk debugging
let db, auth, verifyUser, githubConfig, updateWebResellersInGithub;

async function initialize() {
    const adminModule = require('../_firebase-admin.js');
    db = adminModule.db;
    auth = adminModule.auth;
    verifyUser = adminModule.verifyUser;
    githubConfig = require('../../config.js').githubConfig;
}

// ... (fungsi updateWebResellersInGithub tetap sama seperti di kodemu)
async function updateWebResellersInGithub(targetUsername, password, action = 'add') {
    const { username: owner, repoName } = githubConfig;
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN tidak di-set di Vercel Environment Variables.");
    
    console.log(`Mencoba update GitHub repo: ${owner}/${repoName}`);
    const filePath = 'resellers.json';
    const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`;
    
    console.log("Mengambil file dari GitHub...");
    const fileResponse = await fetch(url, { headers: { 'Authorization': `token ${token}` } });
    if (!fileResponse.ok) {
        console.error("Gagal mengambil file dari GitHub. Status:", fileResponse.status);
        throw new Error("File resellers.json tidak ditemukan di repo atau GITHUB_TOKEN salah.");
    }
    const fileData = await fileResponse.json();
    console.log("File dari GitHub berhasil diambil.");
    const sha = fileData.sha;
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const data = JSON.parse(content);

    const usernameLower = targetUsername.toLowerCase();
    const userIndex = data.resellers.findIndex(r => r.username === usernameLower);

    if (action === 'add') {
        if (userIndex > -1) data.resellers[userIndex].password = password;
        else data.resellers.push({ username: usernameLower, password: password });
    } else if (action === 'remove') {
        if (userIndex > -1) data.resellers.splice(userIndex, 1);
        else return;
    }

    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    console.log("Mengirim update ke GitHub...");
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
        const errorBody = await updateResponse.json();
        console.error("Gagal mengupdate file di GitHub. Response:", errorBody);
        throw new Error("Gagal mengupdate file di GitHub. Pastikan TOKEN punya scope 'repo'.");
    }
    console.log("Update ke GitHub berhasil.");
}


module.exports = async (req, res) => {
    console.log(`--- FUNGSI /api/admin/setUserState DIPANGGIL JAM ${new Date().toLocaleTimeString()} ---`);
    console.log('Request body yang diterima:', JSON.stringify(req.body));

    try {
        await initialize(); // Inisialisasi modul di dalam try-catch

        await verifyUser(req, 'owner');
        const { username, role, banned, password } = req.body;
        if (!username) return res.status(400).json({ message: 'Username is required.' });
        
        if (role === 'web_reseller') {
            if (!password) return res.status(400).json({ message: 'Password untuk reseller web wajib diisi.' });
            await updateWebResellersInGithub(username, password, 'add');
            
            const userDocQuery = await db.collection('users').where('username', '==', username.toLowerCase()).get();
            if (!userDocQuery.empty) {
                await userDocQuery.docs[0].ref.update({ role: 'web_reseller' });
            }
            return res.status(200).json({ message: `User ${username} berhasil ditambahkan sebagai Reseller Web.` });
        }
        
        if (role === 'user' || role === 'reseller') {
            await updateWebResellersInGithub(username, null, 'remove');
        }
        
        const usersRef = db.collection('users');
        const q = usersRef.where('username', '==', username.toLowerCase());
        const querySnapshot = await q.get();
        if (querySnapshot.empty) return res.status(404).json({ message: `User '${username}' not found.` });
        
        const userDoc = querySnapshot.docs[0];
        const updateData = {};
        if (role !== undefined) updateData.role = role;
        if (banned !== undefined) {
             updateData.banned = banned;
             await auth.updateUser(userDoc.id, { disabled: banned });
        }
        
        if (Object.keys(updateData).length > 0) await userDoc.ref.update(updateData);
        
        res.status(200).json({ message: `Status user ${username} berhasil diupdate.` });

    } catch (error) {
        console.error('--- CRASH DI setUserState ---', error);
        res.status(500).json({ message: error.message });
    }
};