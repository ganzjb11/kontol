// api/admin/getAllServers.js
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // Log ini PASTI akan muncul di Vercel setiap kali fungsi dipanggil
    console.log('--- FUNGSI /api/admin/getAllServers DIPANGGIL ---');

    try {
        // Kita pindahkan require ke dalam try...catch agar errornya tertangkap
        const { pterodactylConfig } = require('../../config.js');
        const { verifyUser } = require('../_firebase-admin.js');

        await verifyUser(req, 'owner'); 
        const { domain, apiKey } = pterodactylConfig;

        console.log('Config berhasil dimuat. Domain:', domain);
        console.log('API Key ditemukan (beberapa karakter awal):', apiKey ? apiKey.substring(0, 8) + '...' : 'API KEY KOSONG!');
        
        const response = await fetch(`${domain}/api/application/servers?include=user`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) {
            console.error('Pterodactyl merespon dengan status:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Isi response error dari Pterodactyl:', errorText);
            throw new Error(`Gagal fetch servers dari Pterodactyl (status: ${response.status})`);
        }
        
        const data = await response.json();
        res.status(200).json(data.data);

    } catch (error) {
        // Jika ada error (termasuk path salah), akan di-log di sini
        console.error('--- TERJADI CRASH FATAL DI FUNGSI ---', error);
        res.status(500).json({ message: 'Internal Server Error. Cek log Vercel untuk detail.' });
    }
};
