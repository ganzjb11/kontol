// api/user/my-servers.js
const { pterodactylConfig } = require('../../config.js');
const { verifyUser } = require('../_firebase-admin.js');
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    try {
        const { userData } = await verifyUser(req);
        const { pteroClientApiKey } = userData;

        if (!pteroClientApiKey) {
            return res.status(200).json([]);
        }

        const { domain } = pterodactylConfig;
        
        const response = await fetch(`${domain}/api/client`, {
            headers: { 'Authorization': `Bearer ${pteroClientApiKey}`, 'Accept': 'application/json' }
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error('Gagal mengambil data server dari Pterodactyl.');
        }
        
        const serversWithStats = await Promise.all(data.data.map(async (server) => {
            const statsRes = await fetch(`${domain}/api/client/servers/${server.attributes.identifier}/resources`, {
                headers: { 'Authorization': `Bearer ${pteroClientApiKey}`, 'Accept': 'application/json' }
            });
            if(!statsRes.ok) {
                return { ...server.attributes, stats: { current_state: 'error' } };
            }
            const statsData = await statsRes.json();
            return {
                ...server.attributes,
                stats: statsData.attributes,
            };
        }));

        res.status(200).json(serversWithStats);

    } catch (error) {
        console.error("Error di my-servers:", error);
        res.status(500).json({ message: error.message });
    }
};