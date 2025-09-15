// api/admin/getAllUsers.js
const { db, verifyUser } = require('../_firebase-admin.js');

module.exports = async (req, res) => {
    try {
        await verifyUser(req, 'owner');
        const usersSnapshot = await db.collection('users').get();
        const users = usersSnapshot.docs.map(doc => {
            const data = doc.data();
            delete data.email; 
            return { id: doc.id, ...data };
        });
        res.status(200).json(users);
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};