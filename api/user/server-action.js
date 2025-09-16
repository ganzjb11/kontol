// api/user/server-action.js
const { pterodactylConfig } = require('../../config.js');
const { verifyUser } = require('../_firebase-admin.js');
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const { userData } = await verifyUser(req);
        const { pteroClientApiKey } = userData;
        const { serverId, action } = req.body;

        if (!pteroClientApiKey) {
            throw new Error('User tidak memiliki API Key.');
        }
        if (!serverId || !action) {
            throw new Error('Parameter tidak lengkap.');
        }
        if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
            throw new Error('Aksi tidak valid.');
        }

        const { domain } = pterodactylConfig;
        
        const response = await fetch(`${domain}/api/client/servers/${serverId}/power`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pteroClientApiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ signal: action })
        });

        if (response.status !== 204) {
            try {
                const errorData = await response.json();
                throw new Error(errorData.errors[0].detail);
            } catch (e) {
                throw new Error(`Aksi gagal dengan status: ${response.status}`);
            }
        }

        res.status(200).json({ message: `Sinyal '${action}' berhasil dikirim ke server.` });

    } catch (error) {
        console.error("Error di server-action:", error);
        res.status(500).json({ message: error.message });
    }
};