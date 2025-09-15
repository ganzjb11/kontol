// api/getUserRole.js
const { verifyUser } = require('./_firebase-admin.js');

module.exports = async (req, res) => {
    try {
        // Cukup verifikasi kalau dia user yang valid, tidak perlu role khusus
        const { userData } = await verifyUser(req); 
        // Kirim balik hanya data role-nya
        res.status(200).json({ role: userData.role });
    } catch (error) {
        res.status(401).json({ message: error.message });
    }
};