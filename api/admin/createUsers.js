// api/admin/createUser.js
const { db, auth, verifyUser } = require('../_firebase-admin.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    try {
        const { userData: adminData } = await verifyUser(req, 'owner'); // Hanya Owner
        
        const { username, password } = req.body;
        if (!username || !password || password.length < 6 || username.length < 4) {
            return res.status(400).json({ message: "Username min 4 karakter, Password min 6 karakter." });
        }

        const usernameLower = username.toLowerCase();
        
        // Cek username sudah ada atau belum
        const existingUser = await db.collection('users').where('username', '==', usernameLower).get();
        if (!existingUser.empty) {
            return res.status(409).json({ message: "Username sudah digunakan." });
        }

        const fakeEmail = `${usernameLower}@panel-register.web`;

        // Buat user di Firebase Auth
        const userRecord = await auth.createUser({
            email: fakeEmail,
            password: password,
            displayName: usernameLower
        });
        
        // Simpan data user di Firestore
        await db.collection('users').doc(userRecord.uid).set({
            username: usernameLower,
            email: fakeEmail,
            panelCount: 0,
            role: 'user',
            banned: false,
            addedBy: adminData.uid // Dicatat siapa yang membuat
        });

        res.status(201).json({ message: `User '${usernameLower}' berhasil dibuat.` });

    } catch (error) {
        let errorMessage = error.message;
        if (error.code === 'auth/email-already-exists') {
            errorMessage = "Username sudah digunakan (email sudah terdaftar).";
        }
        res.status(500).json({ message: errorMessage });
    }
};