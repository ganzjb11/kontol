// api/redeem-coupon.js
const { db, verifyUser } = require('./_firebase-admin.js');
const admin = require('firebase-admin');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const { uid, userDoc, userData } = await verifyUser(req);
        const { couponCode } = req.body;

        if (!couponCode) {
            return res.status(400).json({ message: 'Kode kupon tidak boleh kosong.' });
        }

        const couponRef = db.collection('coupons').doc(couponCode.toUpperCase());
        const couponDoc = await couponRef.get();

        if (!couponDoc.exists) {
            return res.status(404).json({ message: 'Kupon tidak valid atau salah ketik.' });
        }

        const couponData = couponDoc.data();
        const redeemedBy = couponData.redeemedBy || [];

        if (redeemedBy.includes(uid)) {
            return res.status(400).json({ message: 'Kupon ini sudah pernah kamu gunakan.' });
        }

        if (redeemedBy.length >= couponData.capacity) {
            return res.status(400).json({ message: 'Kupon telah habis atau expired.' });
        }

        // --- Proses Redeem ---
        const batch = db.batch();

        // 1. Update dokumen kupon
        batch.update(couponRef, {
            redeemedBy: admin.firestore.FieldValue.arrayUnion(uid)
        });

        // 2. Update dokumen user
        const newCouponReward = {
            code: couponData.code,
            rewardRam: couponData.rewardRam,
            used: false,
            claimedAt: new Date()
        };
        batch.update(userDoc.ref, {
            claimedCoupons: admin.firestore.FieldValue.arrayUnion(newCouponReward)
        });

        await batch.commit();

        res.status(200).json({
            message: `Selamat! Kupon berhasil di-redeem. Kamu mendapatkan hak untuk membuat 1 panel dengan RAM ${couponData.rewardRam}.`,
            reward: newCouponReward
        });

    } catch (error) {
        console.error("Error di redeem-coupon:", error);
        res.status(500).json({ message: error.message });
    }
};
