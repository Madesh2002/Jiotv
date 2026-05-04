import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import { keysHandler } from '../keys';
import { mpdHandler } from '../mpd';

export const app = express();
const PORT = 3000;

const IS_VERCEL = !!process.env.VERCEL;
const DATA_FOLDER = IS_VERCEL ? path.join('/tmp', 'data') : path.join(process.cwd(), 'data');

function ensureDataFolder() {
    if (!fs.existsSync(DATA_FOLDER)) {
        fs.mkdirSync(DATA_FOLDER, { recursive: true });
    }
}

const TOKEN_EXPIRY_TIME = 7000; // seconds
const COOKIE_EXPIRY_TIME = 40000; // seconds

app.use(express.json());

// Encryption/Decryption Helpers (Matching PHP logic)
function encrypt_data(data: string, key: string) {
    const k = parseInt(key) || 0;
    let encrypted = '';
    for (let i = 0; i < data.length; i++) {
        encrypted += String.fromCharCode(data.charCodeAt(i) + k);
    }
    return Buffer.from(encrypted, 'binary').toString('base64');
}

function decrypt_data(e_data: string, key: string) {
    const k = parseInt(key) || 0;
    const encrypted = Buffer.from(e_data, 'base64').toString('binary');
    let decrypted = '';
    for (let i = 0; i < encrypted.length; i++) {
        decrypted += String.fromCharCode(encrypted.charCodeAt(i) - k);
    }
    return decrypted;
}

function getCRED() {
    ensureDataFolder();
    const filePath = path.join(DATA_FOLDER, 'creds.jtv');
    const keyPath = path.join(DATA_FOLDER, 'credskey.jtv');
    if (!fs.existsSync(filePath) || !fs.existsSync(keyPath)) {
        return "{}";
    }
    try {
        const key_data = fs.readFileSync(keyPath, 'utf8');
        const e_data = fs.readFileSync(filePath, 'utf8');
        return decrypt_data(e_data, key_data);
    } catch (e) {
        return "{}";
    }
}

// Helper to extract specific cookie
function extractCookie(setCookie: string[] | undefined, name: string): string | null {
    if (!setCookie) return null;
    for (const cookie of setCookie) {
        if (cookie.includes(`${name}=`)) {
            // Some cookies might have attributes like path, secure etc.
            // We only want the key=value part
            const parts = cookie.split(';');
            const match = parts.find(p => p.trim().startsWith(`${name}=`));
            return match ? match.trim() : null;
        }
    }
    return null;
}

const toBase64 = (str: string) => Buffer.from(str).toString('base64');

async function getJioTvData(id: string) {
    const credStr = getCRED();
    const jio_cred = JSON.parse(credStr);
    if (!jio_cred || !jio_cred.authToken) {
        console.error('getJioTvData: No auth token found');
        return null;
    }

    const sessionUser = jio_cred.sessionAttributes?.user || {};
    const access_token = jio_cred.authToken;
    const crm = sessionUser.subscriberId || '';
    const uniqueId = sessionUser.unique || '';
    const device_id = jio_cred.deviceId || '';

    const payload = new URLSearchParams();
    payload.append('stream_type', 'Seek');
    payload.append('channel_id', id);

    const headers = {
        "Host": "jiotvapi.media.jio.com",
        "Content-Type": "application/x-www-form-urlencoded",
        "appkey": "NzNiMDhlYcQyNjJm", // Updated matching jio_headers PHP
        "channel_id": id,
        "userid": crm,
        "crmid": crm,
        "deviceId": device_id,
        "devicetype": "phone",
        "os": "android",
        "dm": "Xiaomi 22101316UP",
        "osversion": "14",
        "srno": "250918144000",
        "accesstoken": access_token,
        "subscriberid": crm,
        "uniqueId": uniqueId,
        "User-Agent": "okhttp/4.12.13",
        "versionCode": "452",
        "X-Forwarded-For": "49.34.128.1", // Spoof Indian IP
        "X-Real-IP": "49.34.128.1"
    };

    try {
        const response = await axios.post("https://jiotvapi.media.jio.com/playback/apis/v1/geturl?langId=6", payload.toString(), { headers });
        return response.data;
    } catch (error: any) {
        console.error('getJioTvData Error:', error.response?.data || error.message);
        return null;
    }
}

async function getAndRefreshCookie(url: string) {
    ensureDataFolder();
    const filePath = path.join(DATA_FOLDER, 'cookie.jtv');
    
    // Check cache
    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const diff = (Date.now() - stats.mtimeMs) / 1000;
        if (diff < COOKIE_EXPIRY_TIME) {
            return fs.readFileSync(filePath, 'utf8');
        }
    }

    // NEW: Fallback - Extract __hdnea__ from the URL itself if present
    try {
        const urlObj = new URL(url);
        const hdneaToken = urlObj.searchParams.get('__hdnea__');
        if (hdneaToken) {
            console.log('Successfully extracted __hdnea__ from URL query params.');
            const hexCookie = Buffer.from(`__hdnea__=${hdneaToken}`).toString('hex');
            fs.writeFileSync(filePath, hexCookie);
            return hexCookie;
        }
    } catch (e) {
        console.warn('Failed to parse URL for token extraction');
    }

    try {
        console.log('Fetching fresh cookie from headers:', url);
        const response = await axios.get(url, {
            headers: { 
                "User-Agent": "plaYtv/7.1.3 (Linux;Android 14) ExoPlayerLib/2.11.7",
                "X-Forwarded-For": "49.34.128.1",
                "X-Real-IP": "49.34.128.1",
                "Origin": "https://www.jiocinema.com",
                "Referer": "https://www.jiocinema.com/",
                "Accept-Encoding": "gzip",
                "Connection": "Keep-Alive"
            },
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 500
        });

        const setCookie = response.headers['set-cookie'];
        const hdnea = extractCookie(setCookie, '__hdnea__');
        
        if (hdnea) {
            console.log('Found __hdnea__ cookie in response headers:', hdnea);
            const hexCookie = Buffer.from(hdnea).toString('hex');
            fs.writeFileSync(filePath, hexCookie);
            return hexCookie;
        } else {
            console.warn('__hdnea__ cookie NOT found in headers. Status:', response.status);
            if (response.status === 451) {
                console.error('Geoblocked (451) and token not found in URL. Handshake may be invalid or restricted.');
            }
        }
    } catch (e: any) {
        console.error('getAndRefreshCookie Fetch Error:', e.message);
        // Fallback to existing if error
        if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
    }
    return null;
}

// Get current credentials status
app.get('/api/jio/status', (req, res) => {
    const creds = JSON.parse(getCRED());
    if (creds && creds.ssoToken) {
        res.json({ 
            status: 'success', 
            loggedIn: true, 
            mobile: creds.number ? Buffer.from(creds.number, 'base64').toString().replace('+91', '') : 'Unknown'
        });
    } else {
        res.json({ status: 'success', loggedIn: false });
    }
});

// Proxy for JioTV Login Send OTP
app.post('/api/jio/send-otp', async (req, res) => {
    const { mobile } = req.body;
    if (!mobile || mobile.length !== 10) {
        return res.status(400).json({ status: 'error', message: 'Invalid mobile number' });
    }

    try {
        const payload = {
            number: toBase64('+91' + mobile)
        };

        const response = await axios.post('https://jiotvapi.media.jio.com/userservice/apis/v1/loginotp/send', payload, {
            headers: {
                'appname': 'RJIL_JioTV',
                'os': 'android',
                'devicetype': 'phone',
                'content-type': 'application/json',
                'user-agent': 'okhttp/3.14.9',
                'X-Forwarded-For': '49.34.128.1',
                'X-Real-IP': '49.34.128.1'
            },
            validateStatus: (status) => status < 500
        });

        if (response.status === 204) {
            return res.json({ status: 'success', message: 'OTP Sent Successfully' });
        } else {
            return res.status(response.status).json({
                status: 'error',
                message: response.data.message || 'Unknown Error'
            });
        }
    } catch (error: any) {
        console.error('Send OTP Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            status: 'error',
            message: error.response?.data?.message || 'Failed to send OTP'
        });
    }
});

// Proxy for JioTV Login Verify OTP
app.post('/api/jio/verify-otp', async (req, res) => {
    ensureDataFolder();
    const { mobile, otp } = req.body;
    if (!mobile || !otp) {
        return res.status(400).json({ status: 'error', message: 'Mobile and OTP are required' });
    }

    try {
        const androidId = crypto.randomBytes(8).toString('hex');
        const payload = {
            number: toBase64('+91' + mobile),
            otp: otp,
            deviceInfo: {
                consumptionDeviceName: 'RMX1945',
                info: {
                    type: 'android',
                    platform: { name: 'RMX1945' },
                    androidId: androidId
                }
            }
        };

        const response = await axios.post('https://jiotvapi.media.jio.com/userservice/apis/v1/loginotp/verify', payload, {
            headers: {
                'appname': 'RJIL_JioTV',
                'os': 'android',
                'devicetype': 'phone',
                'content-type': 'application/json',
                'user-agent': 'okhttp/3.14.9',
                'X-Forwarded-For': '49.34.128.1',
                'X-Real-IP': '49.34.128.1'
            },
            validateStatus: (status) => status < 500
        });

        const data = response.data;
        if (data.ssoToken) {
            // Injection: Ensure the mobile number is part of the saved credentials
            data.number = toBase64('+91' + mobile);
            
            // Save credentials like in PHP
            const u_name = encrypt_data(mobile, "TS-JIOTV");
            const encryptedCreds = encrypt_data(JSON.stringify(data), u_name);
            
            fs.writeFileSync(path.join(DATA_FOLDER, 'creds.jtv'), encryptedCreds);
            fs.writeFileSync(path.join(DATA_FOLDER, 'credskey.jtv'), u_name);

            return res.json({
                status: 'success',
                message: 'Jio LoggedIn Successfully',
                data: data
            });
        } else {
            return res.status(400).json({
                status: 'error',
                message: data.message || 'Verification failed'
            });
        }
    } catch (error: any) {
        console.error('Verify OTP Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            status: 'error',
            message: error.response?.data?.message || 'Failed to verify OTP'
        });
    }
});

// Proxy for Refresh Token
app.post('/api/jio/refresh', async (req, res) => {
    ensureDataFolder();
    try {
        const credsStr = getCRED();
        const JIO_AUTH = JSON.parse(credsStr);

        if (!JIO_AUTH || !JIO_AUTH.ssoToken) {
            return res.status(401).json({ status: 'error', message: 'No credentials found' });
        }

        const ref_TokenPost = {
            appName: "RJIL_JioTV",
            deviceId: JIO_AUTH.deviceId,
            refreshToken: JIO_AUTH.refreshToken
        };

        const response = await axios.post('https://auth.media.jio.com/tokenservice/apis/v1/refreshtoken?langId=6', ref_TokenPost, {
            headers: {
                "accesstoken": JIO_AUTH.authToken,
                "uniqueId": JIO_AUTH.sessionAttributes.user.unique,
                "devicetype": "phone",
                "versionCode": "331",
                "os": "android",
                "Content-Type": "application/json"
            }
        });

        const ref_data = response.data;

        if (ref_data.authToken) {
            // Update auth token in saved data
            JIO_AUTH.authToken = ref_data.authToken;
            
            const keyPath = path.join(DATA_FOLDER, 'credskey.jtv');
            const key_data = fs.readFileSync(keyPath, 'utf8');
            const encryptedCreds = encrypt_data(JSON.stringify(JIO_AUTH), key_data);
            
            fs.writeFileSync(path.join(DATA_FOLDER, 'creds.jtv'), encryptedCreds);

            return res.json({
                status: 'success',
                message: 'Token Refreshed Successfully',
                authToken: ref_data.authToken
            });
        } else {
            return res.status(400).json({
                status: 'error',
                message: ref_data.message || 'Refresh failed'
            });
        }
    } catch (error: any) {
        console.error('Refresh Token Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            status: 'error',
            message: error.response?.data?.message || 'Token Refresh Failed'
        });
    }
});

// Proxy for Universal Cookie Endpoint (Matching cookieData.php)
app.get('/api/jio/universal-cookie', async (req, res) => {
    try {
        console.log('Generating universal cookie...');
        const data = await getJioTvData("144");
        if (data && data.result) {
            const hexCookie = await getAndRefreshCookie(data.result);
            if (hexCookie) {
                const rawCookie = Buffer.from(hexCookie, 'hex').toString();
                
                // FORCE UNIVERSAL ACL (acl=/*)
                const universalCookie = rawCookie.replace(/acl=[^~]*/, 'acl=/*');

                const now = new Date();
                const lastUpdated = now.toLocaleString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    timeZone: 'Asia/Kolkata'
                }).replace(',', '');

                console.log('Universal cookie generated successfully');
                return res.json([
                    { last_updated: lastUpdated },
                    { cookie: universalCookie }
                ]);
            } else {
                return res.status(500).json({ status: 'error', message: 'Failed to retrieve hex cookie from player URL' });
            }
        } else {
            return res.status(401).json({ status: 'error', message: 'Handshake failed. User might be logged out or unauthorized.' });
        }
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Routes for Playlist and DASH Streams
app.get('/playlist.m3u', (req, res) => {
    try {
        const channels = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'channels.json'), 'utf8'));
        
        // Better Base URL detection
        const xfp = req.headers['x-forwarded-proto'] as string;
        const protocol = xfp ? xfp.split(',')[0].trim() : (req.secure ? 'https' : 'http');
        const xfh = req.headers['x-forwarded-host'] as string;
        const host = xfh || req.headers['host'];
        const baseUrl = `${protocol}://${host}`;
        
        console.log(`[Playlist] Generating for baseUrl: ${baseUrl}`);
        
        let m3u = `#EXTM3U x-tvg-url="${baseUrl}/epg.xml"\n`;

        for (const c of channels) {
            if (!c.channel_id || !c.channel_name) continue;

            const genre = (c.channel_genre || 'Live').toUpperCase();
            const group = "SNEH-TV | " + genre;
            const lang = c.language || 'Hindi';
            const logo = c.channel_logo || '';
            
            m3u += `#EXTINF:-1 tvg-id="${c.channel_id}" tvg-name="${c.channel_name}" tvg-logo="${logo}" group-title="${group}" tvg-language="${lang}" tvg-type="live",${c.channel_name}\n`;
            
            if (c.channel_url && c.channel_url.includes('.mpd')) {
                m3u += `#KODIPROP:inputstream.adaptive.manifest_type=mpd\n`;
                m3u += `#KODIPROP:inputstream.adaptive.license_type=clearkey\n`;
                m3u += `#KODIPROP:inputstream.adaptive.license_key=${baseUrl}/api/keys?id=${c.channel_id}\n`;
                m3u += `${baseUrl}/api/mpd?id=${c.channel_id}\n`;
            } else {
                m3u += `${c.channel_url || ''}\n`;
            }
        }
        
        res.setHeader('Content-Type', 'application/x-mpegurl');
        res.setHeader('Content-Disposition', 'inline; filename="playlist.m3u"');
        res.send(m3u);
    } catch (e: any) {
        console.error('[Playlist] Generation Error:', e);
        res.status(500).send(e.message);
    }
});

app.get('/epg.xml', (req, res) => {
    try {
        const channels = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'channels.json'), 'utf8'));
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="SNEH-TV">\n`;

        for (const c of channels) {
            xml += `  <channel id="${c.channel_id}">
    <display-name>${c.channel_name}</display-name>
    <icon src="${c.channel_logo || ''}" />
  </channel>\n`;
        }

        for (const c of channels) {
            // One week of dummy programming starting from yesterday
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            
            for (let i = 0; i < 48; i++) {
                const progStart = new Date(start.getTime() + (i * 3600000));
                const progEnd = new Date(progStart.getTime() + 3600000);
                
                const formatTime = (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + " +0530";
                
                xml += `  <programme start="${formatTime(progStart)}" stop="${formatTime(progEnd)}" channel="${c.channel_id}">
    <title lang="en">Live: ${c.channel_name}</title>
    <desc lang="en">SNEH-TV Live Stream</desc>
  </programme>\n`;
            }
        }

        xml += `</tv>`;
        res.setHeader('Content-Type', 'application/xml');
        res.send(xml);
    } catch (e: any) {
        res.status(500).send(e.message);
    }
});

app.all('/api/keys', keysHandler);

app.all('/api/mpd', (req, res) => mpdHandler(req, res, getJioTvData, getAndRefreshCookie));

app.get('/api/channels', (req, res) => {
    try {
        const channels = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'channels.json'), 'utf8'));
        res.json(channels);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Routes for Playlist and DASH Streams
// (Keep all the app.get/post calls as they are defined globally)

// Vite and Static Serving logic (Optional for Vercel as handled by vercel.json)
if (!IS_VERCEL) {
    (async () => {
        if (process.env.NODE_ENV !== 'production') {
            console.log('[Server] Initializing Vite middleware...');
            const vite = await createViteServer({
                server: { middlewareMode: true },
                appType: 'spa',
            });
            app.use(vite.middlewares);
        } else {
            const distPath = path.join(process.cwd(), 'dist');
            if (fs.existsSync(distPath)) {
                app.use(express.static(distPath));
                app.get('*', (req, res) => {
                    res.sendFile(path.join(distPath, 'index.html'));
                });
            }
        }

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on http://0.0.0.0:${PORT}`);
        });
    })().catch(err => console.error('[Server] Init Error:', err));
}

export default app;
