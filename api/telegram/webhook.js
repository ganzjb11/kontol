// api/telegram/webhook.js
const { db } = require('../_firebase-admin.js');
const { telegramConfig } = require('../../config.js');
const fetch = require('node-fetch');

async function sendResponseMessage(chatId, messageId, text) {
    const { botToken } = telegramConfig;
    if (!botToken) return;

    const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'Markdown'
        })
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { callback_query } = req.body;
    if (!callback_query) return res.status(200).send('OK');

    const [action, requestId] = callback_query.data.split(':');
    const chatId = callback_query.message.chat.id;
    const messageId = callback_query.message.message_id;

    try {
        const requestRef = db.collection('roleChangeRequests').doc(requestId);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists || requestDoc.data().status !== 'pending') {
            await sendResponseMessage(chatId, messageId, 'Permintaan ini sudah tidak valid atau sudah diproses.');
            return res.status(200).send('OK');
        }

        const requestData = requestDoc.data();
        const userRef = db.collection('users').doc(requestData.targetUid);

        if (action === 'approve') {
            await userRef.update({ role: requestData.newRole });
            await requestRef.update({ status: 'approved', resolvedAt: new Date() });
            await sendResponseMessage(chatId, messageId, `✅ Berhasil! Role untuk *${requestData.targetUsername}* telah diubah menjadi *${requestData.newRole}*.\n\n_Diproses oleh Owner._`);
        } else if (action === 'reject') {
            await requestRef.update({ status: 'rejected', resolvedAt: new Date() });
            await sendResponseMessage(chatId, messageId, `❌ Dibatalkan. Permintaan untuk *${requestData.targetUsername}* telah ditolak.\n\n_Diproses oleh Owner._`);
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error("Error di webhook Telegram:", error);
        await sendResponseMessage(chatId, messageId, `Terjadi error internal saat memproses permintaan. Cek log Vercel.`);
        res.status(200).send('Error');
    }
};