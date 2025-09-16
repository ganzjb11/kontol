// api/getUserRole.js
const { verifyUser } = require('./_firebase-admin.js');

module.exports = async (req, res) => {
    try {
        const { userData } = await verifyUser(req); 
        res.status(200).json({ role: userData.role });
    } catch (error) {
        res.status(401).json({ message: error.message });
    }
};