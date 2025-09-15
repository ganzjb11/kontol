// api/reseller/getMyUsers.js
const { db, verifyUser } = require('../_firebase-admin.js');

module.exports = async (req, res) => {
    try {
        const { uid, userData } = await verifyUser(req, 'web_reseller');
        let users = [];
        if (userData.role === 'owner') {
            const snapshot = await db.collection('users').get();
            users = snapshot.docs.map(doc => {
                const data = doc.data();
                delete data.email;
                return { id: doc.id, ...data };
            });
        } else {
            const snapshot = await db.collection('users').where('addedBy', '==', uid).get();
            users = snapshot.docs.map(doc => {
                const data = doc.data();
                delete data.email;
                return { id: doc.id, ...data };
            });
        }
        res.status(200).json(users);
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};