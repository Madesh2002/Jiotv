import fs from 'fs';
import path from 'path';
import axios from 'axios';

// --- Star Sports Channels List ---
const STAR_SPORTS_CHANNELS = [
    "Star Sports Select 1 HD", "Star Sports Select 1", "Star Sports Select 2 HD", "Star Sports Select 2",
    "Star Sports 1 HD", "Star Sports 1", "Star Sports 1 Hindi HD", "Star Sports 1 Hindi",
    "Star Sports 2 HD", "Star Sports 2", "Star Sports 2 Hindi HD", "Star Sports 2 Hindi",
    "Star Sports 3", "Star Sports 1 Tamil HD", "Star Sports 1 Tamil", "Star Sports 1 Telugu HD",
    "Star Sports 1 Telugu", "Star Sports 1 Kannada", "Star Sports 2 Kannada", "Star Sports 2 Tamil HD",
    "Star Sports 2 Tamil", "Star Sports 2 Telugu HD", "Star Sports 2 Telugu"
];

export async function mpdHandler(req: any, res: any, getJioTvData: Function, getAndRefreshCookie: Function) {
    const id = req.query.id as string;
    if (!id) return res.status(400).send("Missing id");

    try {
        const channels = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'channels.json'), 'utf8'));
        const channel = channels.find((c: any) => c.channel_id === id);
        if (!channel) return res.status(404).send("Channel not found");

        let baseUrl = channel.channel_url;
        let token = '';

        // 1. Fetch Token (Star Sports or Universal)
        if (STAR_SPORTS_CHANNELS.includes(channel.channel_name)) {
            try {
                console.log(`[MPD] Fetching special token for: ${channel.channel_name}`);
                const starResp = await axios.get("https://allinonereborn.online/jtv-fetch/jstarcookie/cookie.json", { 
                    timeout: 10000,
                    headers: {
                        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                });
                const results = starResp.data.failed_results || [];
                const match = results.find((item: any) => item.channel_name === channel.channel_name);
                if (match) {
                    const finalUrl = match.error_details?.final_url || '';
                    const m = finalUrl.match(/__hdnea__=([^;|\s&]+)/);
                    if (m) token = m[1];
                }
            } catch (e) {
                console.warn(`[MPD] Star Sports fetch failed for ${channel.channel_name}`);
            }
        }

        // --- DEFAULT FETCH: Universal Auth ---
        if (!token) {
            try {
                console.log(`[MPD] Using Universal Auth for: ${channel.channel_name}`);
                const data = await getJioTvData("144");
                if (data && data.result) {
                    const hexCookie = await getAndRefreshCookie(data.result);
                    if (hexCookie) {
                        let rawCookie = Buffer.from(hexCookie, 'hex').toString();
                        
                        // Apply Universal ACL (Crucial for playback across channels)
                        rawCookie = rawCookie.replace(/acl=[^~]*/, 'acl=/*');
                        
                        const m = rawCookie.match(/__hdnea__=([^;|\s]+)/);
                        if (m) token = m[1];
                    }
                }
            } catch (e: any) {
                console.error(`[MPD] Universal Auth failed: ${e.message}`);
            }
        }

        if (!token) {
            return res.status(503).send("Token generation failed");
        }

        // Construct Final URL
        baseUrl = baseUrl.split('?')[0];
        const finalUrl = `${baseUrl}?__hdnea__=${token}`;

        console.log(`[MPD] Redirecting to: ${finalUrl}`);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/dash+xml");
        res.redirect(302, finalUrl);
    } catch (e: any) {
        res.status(500).send("MPD Processing Error: " + e.message);
    }
}
