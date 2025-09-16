// api/servers.js
const { pterodactylConfig } = require('../config.js');
const { verifyUser } = require('./_firebase-admin.js');
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    try {
        const { userData } = await verifyUser(req);
        const { pteroClientApiKey } = userData;
        const { domain } = pterodactylConfig;

        if (!pteroClientApiKey && req.method === 'GET') {
            return res.status(200).json([]);
        }
        if (!pteroClientApiKey) {
            return res.status(400).json({ message: 'Client API Key tidak ditemukan.' });
        }

        if (req.method === 'GET') {
            const response = await fetch(`${domain}/api/client`, {
                headers: { 'Authorization': `Bearer ${pteroClientApiKey}`, 'Accept': 'application/json' }
            });
            const data = await response.json();
            if (!response.ok) throw new Error('Gagal mengambil data server.');
            
            const serversWithStats = await Promise.all(data.data.map(async (server) => {
                const statsRes = await fetch(`${domain}/api/client/servers/${server.attributes.identifier}/resources`, {
                    headers: { 'Authorization': `Bearer ${pteroClientApiKey}`, 'Accept': 'application/json' }
                });
                const statsData = statsRes.ok ? await statsRes.json() : { attributes: { current_state: 'error' } };
                return { ...server.attributes, stats: statsData.attributes };
            }));
            return res.status(200).json(serversWithStats);
        }

        if (req.method === 'POST') {
            const { serverId, action } = req.body;
            if (!serverId || !action) throw new Error('Parameter tidak lengkap.');
            if (!['start', 'stop', 'restart', 'kill'].includes(action)) throw new Error('Aksi tidak valid.');

            const response = await fetch(`${domain}/api/client/servers/${serverId}/power`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${pteroClientApiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ signal: action })
            });

            if (response.status !== 204) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.errors ? errorData.errors[0].detail : `Aksi gagal dengan status: ${response.status}`);
            }
            return res.status(200).json({ message: `Sinyal '${action}' berhasil dikirim.` });
        }

        return res.status(405).json({ message: 'Method not allowed' });

    } catch (error) {
        console.error("Error di API Servers:", error);
        res.status(500).json({ message: error.message });
    }
};