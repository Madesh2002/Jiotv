/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, ShieldCheck, LogIn, X, Loader2, RefreshCw, LogOut, List, ExternalLink, Copy, Download, User, Check, Info, LayoutTemplate, Radio, MonitorPlay } from 'lucide-react';
import { Screen, JioResponse } from './types';

export default function App() {
  const [screen, setScreen] = useState<Screen>('LOGIN');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [cookieData, setCookieData] = useState<{ last_updated: string, cookie: string } | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    checkStatus();
    loadChannels();
  }, []);

  const checkStatus = async () => {
    try {
      const resp = await fetch('/api/jio/status');
      const data = await resp.json();
      if (data.loggedIn) {
        setMobile(data.mobile);
        setScreen('SUCCESS');
        await handleGetCookie();
      }
    } catch (e) {
      console.error('Status check failed');
    }
  };

  const loadChannels = async () => {
    try {
      const resp = await fetch('/api/channels');
      const data = await resp.json();
      setChannels(data);
    } catch (e) {
      console.error('Failed to load channels');
    }
  };

  const handleGetCookie = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/jio/universal-cookie');
      const data = await resp.json();
      if (Array.isArray(data) && data.length === 2) {
        setCookieData({
          last_updated: data[0].last_updated,
          cookie: data[1].cookie
        });
      } else {
        setError(data.message || 'Failed to fetch cookie');
      }
    } catch (e) {
      setError('Connection error fetching cookie');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (mobile.length !== 10) {
      setError('Please enter a 10-digit mobile number');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/jio/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      
      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error(`Server returned invalid response (Status: ${response.status})`);
      }

      if (data.status === 'success') {
        setScreen('OTP_VERIFY');
        setCountdown(30);
      } else {
        setError(data.message || 'Failed to send OTP');
      }
    } catch (err: any) {
      console.error('Send OTP Error:', err);
      setError(err.message === 'Failed to fetch' ? 'Network error: Check your internet connection' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length !== 6) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/jio/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, otp: otpCode }),
      });
      
      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error(`Server returned invalid response (Status: ${response.status})`);
      }

      if (data.status === 'success') {
        setScreen('SUCCESS');
        setSuccessMsg(null);
        handleGetCookie();
      } else {
        setError(data.message || 'Verification failed');
      }
    } catch (err: any) {
      console.error('Verify OTP Error:', err);
      setError(err.message === 'Failed to fetch' ? 'Network error: Check your connection' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (isNaN(Number(value))) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const reset = () => {
    setScreen('LOGIN');
    setMobile('');
    setOtp(['', '', '', '', '', '']);
    setError(null);
    setSuccessMsg(null);
  };

  const playlistUrl = typeof window !== 'undefined' ? `${window.location.origin}/playlist.m3u` : '';
  const epgUrl = typeof window !== 'undefined' ? `${window.location.origin}/epg.xml` : '';

  return (
    <div className="min-h-screen bg-slate-950 p-4 font-sans antialiased text-slate-100 flex flex-col items-center">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-600/10 blur-[140px] rounded-full" />
      </div>

      <header className="w-full max-w-5xl flex justify-between items-center py-6 mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-pink-600 rounded-xl flex items-center justify-center p-2 shadow-xl shadow-purple-500/20">
            <Radio size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">SNEH-TV</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Playlist Generator</p>
          </div>
        </div>
        
        {screen === 'SUCCESS' && (
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-2xl text-xs">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-slate-300 font-medium">+91 {mobile}</span>
            </div>
            <button 
              onClick={reset} 
              className="p-2.5 bg-slate-900 border border-slate-700/50 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl transition-all"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </header>

      <main className="w-full max-w-5xl relative z-10 flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {screen === 'LOGIN' && (
            <motion.div 
              key="login"
              className="m-auto w-full max-w-md bg-slate-900/60 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-10 shadow-3xl overflow-hidden"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="space-y-8">
                <div className="text-center space-y-3">
                  <h1 className="text-4xl font-extrabold tracking-tight text-white underline decoration-purple-500/30 underline-offset-8 decoration-4">Login</h1>
                  <p className="text-slate-400 text-sm font-medium">Link your account to generate the playlist</p>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between gap-3 text-red-400 text-sm"
                  >
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="hover:text-red-200 transition-colors">
                      <X size={16} />
                    </button>
                  </motion.div>
                )}

                <form onSubmit={handleSendOtp} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">
                      Mobile Number
                    </label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                        <Phone size={18} />
                      </div>
                      <input 
                        type="tel"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit number"
                        className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl py-4.5 pl-12 pr-4 outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50 transition-all font-medium text-white text-lg tracking-wider placeholder:text-slate-700"
                        required
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={loading || mobile.length !== 10}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-bold py-5 rounded-[1.5rem] shadow-2xl shadow-purple-600/30 transition-all flex items-center justify-center gap-3 transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {loading ? <Loader2 className="animate-spin" size={24} /> : <><LogIn size={24} /> Get Authentication OTP</>}
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {screen === 'OTP_VERIFY' && (
            <motion.div
              key="otp"
              className="m-auto w-full max-w-md bg-slate-900/60 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-10 shadow-3xl"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="space-y-10">
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 mx-auto bg-purple-500/10 rounded-[2rem] flex items-center justify-center text-purple-400 ring-1 ring-purple-500/20">
                    <ShieldCheck size={40} />
                  </div>
                  <div className="space-y-1">
                    <h1 className="text-3xl font-extrabold text-white">Verification</h1>
                    <p className="text-slate-400 text-sm font-medium">OTP sent to <span className="text-white">+91 {mobile}</span></p>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm text-center font-medium">
                    {error}
                  </div>
                )}

                <div className="flex justify-center gap-3">
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (otpRefs.current[idx] = el)}
                      type="tel"
                      value={digit}
                      maxLength={1}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      className="w-12 h-16 bg-slate-950/50 border border-slate-700/50 rounded-2xl text-center text-2xl font-black text-white outline-none focus:ring-2 focus:ring-purple-500/50 transition-all shadow-inner"
                    />
                  ))}
                </div>

                <div className="space-y-6">
                   <button 
                    onClick={handleVerifyOtp}
                    disabled={loading || otp.some(d => !d)}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-5 rounded-[1.5rem] shadow-xl transition-all flex items-center justify-center gap-3"
                  >
                    {loading ? <Loader2 className="animate-spin" size={24} /> : 'Complete Login'}
                  </button>
                  
                  <p className="text-center text-sm">
                    {countdown > 0 ? (
                      <span className="text-slate-500">Wait <span className="text-slate-300 font-bold">{countdown}s</span> for new OTP</span>
                    ) : (
                      <button onClick={() => handleSendOtp()} className="text-purple-400 hover:text-purple-300 font-bold underline-offset-4 hover:underline transition-all">Resend Code</button>
                    )}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {screen === 'SUCCESS' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Main Content Area */}
              <div className="lg:col-span-8 space-y-8">
                {/* Header Info */}
                <div className="bg-gradient-to-tr from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-[2.5rem] p-8 relative overflow-hidden group">
                  <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-2 text-purple-400">
                      <Check size={20} className="bg-purple-900/40 rounded-full p-1" />
                      <span className="text-xs font-black uppercase tracking-widest">Authentication Active</span>
                    </div>
                    <h2 className="text-4xl font-black text-white leading-tight">Your Playlist is <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Ready for Stream</span></h2>
                    <p className="text-slate-400 max-w-md font-medium">Use the links below in any IPTV application like IPTV Smarters, Tivimate, or OTT Navigator.</p>
                  </div>
                  <LayoutTemplate size={160} className="absolute bottom-[-20px] right-[-20px] text-white/5 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
                </div>

                {/* Playlist Links Card */}
                <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold flex items-center gap-3">
                      <List size={22} className="text-purple-500" />
                      Stream URLs
                    </h3>
                  </div>

                  <div className="space-y-6">
                    {/* M3U Link */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-end px-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">M3U Playlist URL</label>
                        <span className="text-[10px] text-slate-600 font-mono">Dynamic Channel List</span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-4.5 font-mono text-sm text-slate-300 truncate">
                          {playlistUrl}
                        </div>
                        <button 
                          onClick={() => copyToClipboard(playlistUrl, 'm3u')}
                          className="bg-slate-800 hover:bg-purple-600 p-4.5 rounded-2xl transition-all relative"
                        >
                          {copiedId === 'm3u' ? <Check size={20} /> : <Copy size={20} />}
                        </button>
                        <a 
                          href="/playlist.m3u" 
                          download="sneh-tv.m3u"
                          className="bg-slate-800 hover:bg-pink-600 p-4.5 rounded-2xl transition-all"
                        >
                          <Download size={20} />
                        </a>
                      </div>
                    </div>

                    {/* EPG Link */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-end px-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">EPG Guide URL</label>
                        <span className="text-[10px] text-slate-600 font-mono">XML Formatted</span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-4.5 font-mono text-sm text-slate-300 truncate">
                          {epgUrl}
                        </div>
                        <button 
                          onClick={() => copyToClipboard(epgUrl, 'epg')}
                          className="bg-slate-800 hover:bg-purple-600 p-4.5 rounded-2xl transition-all"
                        >
                          {copiedId === 'epg' ? <Check size={20} /> : <Copy size={20} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800/50 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/30 px-4 py-2 rounded-full border border-slate-700/30">
                      <MonitorPlay size={14} className="text-purple-400" />
                      <span>{channels.length} Live Channels</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/30 px-4 py-2 rounded-full border border-slate-700/30">
                      <RefreshCw size={14} className="text-pink-400" />
                      <span>Auto-Refresh Enabled</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar: Stats & Info */}
              <div className="lg:col-span-4 space-y-6">
                {/* Cookie Information */}
                <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Session</h3>
                    <button 
                      onClick={handleGetCookie}
                      disabled={loading}
                      className="p-2 text-slate-500 hover:text-purple-400 transition-colors"
                    >
                      <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  
                  {cookieData ? (
                    <div className="space-y-4">
                       <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-[10px] font-mono break-all text-slate-400 max-h-[120px] overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                         {cookieData.cookie}
                       </div>
                       <button 
                          onClick={() => copyToClipboard(cookieData.cookie, 'cookie')}
                          className="w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
                       >
                          {copiedId === 'cookie' ? <Check size={16} /> : <Copy size={16} />} 
                          {copiedId === 'cookie' ? 'Copied Cookie' : 'Copy Access Cookie'}
                       </button>
                       <div className="flex items-center gap-2 text-[10px] text-slate-500 justify-center">
                         <Info size={12} />
                         <span>Updated: {new Date(cookieData.last_updated).toLocaleString()}</span>
                       </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 space-y-4">
                      <p className="text-xs text-slate-500">No active session found</p>
                      <button onClick={handleGetCookie} className="w-full py-4 bg-purple-600 hover:bg-purple-500 rounded-2xl text-white text-sm font-bold shadow-lg shadow-purple-900/20 transition-all">
                        Generate Session
                      </button>
                    </div>
                  )}
                </div>

                {/* Instructions Card */}
                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8 space-y-6">
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Quick Guide</h4>
                  <div className="space-y-6">
                    {[
                      { step: '1', text: 'Copy the M3U Playlist URL provided above.' },
                      { step: '2', text: 'Open your preferred IPTV Player app.' },
                      { step: '3', text: 'Locate "Add Playlist" and paste the URL.' },
                      { step: '4', text: 'Apply EPG link for program guide support.' }
                    ].map((item, i) => (
                      <div key={i} className="flex gap-4">
                        <span className="w-6 h-6 bg-slate-800 flex-shrink-0 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-400 border border-slate-700/50">
                          {item.step}
                        </span>
                        <p className="text-xs text-slate-400 font-medium leading-relaxed">{item.text}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="pt-4 mt-6 border-t border-slate-800/50 text-center">
                    <p className="text-[10px] text-slate-600 font-medium">Compatible with Android TV, FireStick, iOS, & Web.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="w-full max-w-5xl mt-12 py-8 border-t border-slate-800/50 text-center relative z-10">
        <div className="flex flex-col items-center gap-4">
          <p className="text-slate-600 text-[10px] tracking-[0.3em] uppercase font-bold">
            Project <span className="text-purple-500">SNEH-TV</span> Version 2.0
          </p>
          <div className="flex gap-6 opacity-30">
            <Radio size={16} />
            <MonitorPlay size={16} />
            <List size={16} />
          </div>
        </div>
      </footer>
    </div>
  );
}
