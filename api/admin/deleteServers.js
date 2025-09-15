// api/admin/deleteServer.js
const { pterodactylConfig } = require('../../config.js');
const { verifyUser } = require('../_firebase-admin.js');
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
    try {
        await verifyUser(req, 'owner'); // Hanya Owner
        const { serverId } = req.body;
        if (!serverId) return res.status(400).json({ message: "Server ID wajib diisi." });

        const { domain, apiKey } = pterodactylConfig;
        const response = await fetch(`${domain}/api/application/servers/${serverId}/force`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (response.status !== 204) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData ? errorData.errors[0].detail : "Gagal menghapus server.");
        }
        
        res.status(200).json({ message: `Server ID ${serverId} berhasil dihapus paksa.` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
