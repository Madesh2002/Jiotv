import fs from 'fs';
import path from 'path';

function base64UrlEncode(buffer: Buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function keysHandler(req: any, res: any) {
    const id = req.query.id as string;
    const ua = req.headers['user-agent'] || '';

    // Robust CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    if (!id) {
        console.error('[Keys] Error: Missing ID');
        return res.status(400).json({ error: "Missing channel id" });
    }

    try {
        console.log(`[Keys] ${req.method} request for ID: ${id}`);
        const filePath = path.join(process.cwd(), 'channels.json');
        const channels = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const channel = channels.find((c: any) => c.channel_id === id);

        if (!channel || !channel.keyId || !channel.key || channel.keyId === "null") {
            console.warn(`[Keys] No keys found for ID: ${id}`);
            return res.status(404).json({ error: "No keys assigned" });
        }

        const kid_b64 = base64UrlEncode(Buffer.from(channel.keyId, 'hex'));
        const key_b64 = base64UrlEncode(Buffer.from(channel.key, 'hex'));

        const response = {
            keys: [{
                kty: "oct",
                kid: kid_b64,
                k: key_b64
            }],
            type: "temporary"
        };

        console.log(`[Keys] Sending keys for: ${channel.channel_name}`);
        res.status(200).json(response);
    } catch (e: any) {
        console.error(`[Keys] Error: ${e.message}`);
        res.status(500).json({ error: "License Error" });
    }
}
