
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type, Modality, GenerateContentResponse, LiveServerMessage } from "@google/genai";
import { 
  Send, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Search, 
  Settings, 
  Sparkles, 
  User, 
  Bot, 
  ExternalLink,
  Loader2,
  Trash2,
  ChevronRight,
  Download,
  Terminal,
  Clock,
  Key,
  Mic,
  MicOff,
  Volume2,
  Activity,
  MapPin,
  Maximize2,
  Flame,
  Zap,
  ShieldCheck,
  Cpu,
  Globe,
  Code,
  CheckCircle2,
  FileCode2,
  FolderOpen
} from 'lucide-react';

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  type: 'text' | 'image' | 'video' | 'live';
  groundingMetadata?: any;
  timestamp: number;
}

export default function AniloStudio() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'images' | 'live' | 'dev'>('chat');
  const [isLive, setIsLive] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineCap = 'round';
    ctx.beginPath();

    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * canvas.height / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  useEffect(() => {
    if (isLive) drawWaveform();
    else if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, [isLive, drawWaveform]);

  const encodeAudio = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const decodeAudio = (base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  const startLiveSession = async () => {
    if (isLive) { stopLiveSession(); return; }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const sessionPromise = ai.live.connect({
        model: LIVE_MODEL,
        callbacks: {
          onopen: () => {
            setIsLive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const base64 = encodeAudio(new Uint8Array(int16.buffer));
              sessionPromise.then(session => session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (message) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              const buffer = await decodeAudioData(decodeAudio(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(analyser);
              analyser.connect(outputCtx.destination);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onclose: () => setIsLive(false)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (err) { console.error(err); }
  };

  const stopLiveSession = () => {
    if (liveSessionRef.current) liveSessionRef.current.close();
    setIsLive(false);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, type: 'text', timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    const prompt = input;
    setInput('');
    setIsLoading(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    try {
      if (activeTab === 'chat' || activeTab === 'dev') {
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: prompt,
          config: { tools: [{ googleSearch: {} }, { googleMaps: {} }] }
        });
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: response.text || '', type: 'text', groundingMetadata: response.candidates?.[0]?.groundingMetadata, timestamp: Date.now() }]);
      } else if (activeTab === 'images') {
        const response = await ai.models.generateContent({ model: IMAGE_MODEL, contents: prompt });
        const imageUrl = `data:image/png;base64,${response.candidates[0].content.parts.find(p => p.inlineData)?.inlineData?.data}`;
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: imageUrl, type: 'image', timestamp: Date.now() }]);
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="flex h-screen bg-[#020202] text-slate-100 overflow-hidden font-sans selection:bg-amber-500/30">
      {/* Sidebar - Desktop Only */}
      <aside className="hidden md:flex w-80 bg-[#080808] border-r border-white/5 flex-col p-6 space-y-8 z-20">
        <div className="flex items-center space-x-3 px-2">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-amber-500/20 rotate-3">
            <Flame className="text-black" size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black italic uppercase tracking-tighter leading-none">Anilo OS</h1>
            <span className="text-[10px] text-amber-500/60 font-bold tracking-[0.3em] uppercase">Enterprise</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <NavItem active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<Bot size={20} />} label="Muloqot" />
          <NavItem active={activeTab === 'live'} onClick={() => setActiveTab('live')} icon={<Activity size={20} />} label="Jonli Ovoz" />
          <NavItem active={activeTab === 'images'} onClick={() => setActiveTab('images')} icon={<ImageIcon size={20} />} label="Tasvir Generator" />
          <NavItem active={activeTab === 'dev'} onClick={() => setActiveTab('dev')} icon={<Terminal size={20} />} label="Dev Console" />
        </nav>

        <div className="space-y-4">
          <div className="bg-gradient-to-br from-white/5 to-transparent p-5 rounded-3xl border border-white/5 space-y-3">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-white/40">
              <span>System Core</span>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
            <div className="flex items-center space-x-3">
              <Cpu size={14} className="text-amber-500" />
              <span className="text-[11px] font-mono">GEMINI-3.0-PRO</span>
            </div>
            <div className="flex items-center space-x-3">
              <Globe size={14} className="text-amber-500" />
              <span className="text-[11px] font-mono">GROUNDING_ACTIVE</span>
            </div>
          </div>
          
          {isLive && (
            <div className="bg-amber-500/5 p-4 rounded-3xl border border-amber-500/20 backdrop-blur-md">
              <canvas ref={canvasRef} width={240} height={50} className="w-full opacity-80" />
            </div>
          )}
        </div>
      </aside>

      {/* Main UI */}
      <main className="flex-1 flex flex-col relative bg-[#020202] z-10">
        <header className="h-20 flex items-center justify-between px-8 border-b border-white/5 backdrop-blur-2xl bg-black/40 sticky top-0 z-30">
          <div className="flex items-center space-x-4">
             <div className="md:hidden w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
               <Flame size={20} className="text-black" />
             </div>
             <div>
               <span className="text-amber-500 font-black uppercase text-[11px] tracking-[0.25em] block">{activeTab} system</span>
               <span className="text-[10px] text-white/30 uppercase tracking-widest">Active session: {new Date().toLocaleTimeString()}</span>
             </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {activeTab === 'live' && (
              <button 
                onClick={startLiveSession} 
                className={`flex items-center space-x-3 px-6 py-2.5 rounded-full font-black text-[11px] uppercase tracking-[0.15em] transition-all duration-500 ${isLive ? 'bg-red-500 text-white shadow-xl shadow-red-500/20 animate-pulse' : 'bg-amber-500 text-black shadow-xl shadow-amber-500/30 hover:scale-105'}`}
              >
                {isLive ? <MicOff size={14} /> : <Mic size={14} />}
                <span>{isLive ? 'Disconnect' : 'Connect Live'}</span>
              </button>
            )}
            <button className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
              <Settings size={20} className="text-white/60" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 custom-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-12 max-w-2xl mx-auto">
              {activeTab === 'dev' ? (
                <div className="w-full space-y-10">
                  <div className="bg-green-500/5 border border-green-500/20 p-8 rounded-[40px] text-left space-y-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center">
                        <CheckCircle2 className="text-black" size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-green-500">Build Successful!</h3>
                        <p className="text-xs text-white/40 uppercase tracking-widest">APK fayli muvaffaqiyatli yaratildi</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                        <div className="flex items-center space-x-3">
                          <FileCode2 size={18} className="text-amber-500" />
                          <span className="text-[13px] font-mono text-white/80">app-debug.apk</span>
                        </div>
                        <span className="text-[11px] text-white/20 font-mono">~25 MB</span>
                      </div>
                      
                      <div className="bg-white/5 p-5 rounded-2xl space-y-2">
                        <div className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                          <FolderOpen size={12} />
                          <span>Fayl manzili:</span>
                        </div>
                        <code className="block text-[11px] font-mono text-amber-500 break-all bg-black/50 p-3 rounded-lg border border-amber-500/10">
                          Anilouz2/app/build/outputs/apk/debug/app-debug.apk
                        </code>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <DevActionCard 
                        title="APK'ni yuklab olish" 
                        cmd="ls -lh app/build/outputs/apk/debug/app-debug.apk"
                        desc="Fayl borligini tasdiqlash uchun"
                      />
                      <DevActionCard 
                        title="Tozalash (Clean)" 
                        cmd="./gradlew clean"
                        desc="Hamma keshni o'chirib yangidan build qilish"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full scale-150 animate-pulse" />
                    <Bot size={80} className="text-amber-500 relative z-10" />
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter">Qanday yordam bera olaman?</h2>
                    <p className="text-sm md:text-base text-white/40 uppercase tracking-[0.4em] font-medium leading-relaxed">
                      Loyiha, kodlash yoki ijodiy jarayonni boshlaymiz
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-8 duration-500`}>
              <div className={`max-w-[90%] md:max-w-[75%] ${m.role === 'user' ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-black shadow-2xl shadow-amber-500/20 p-6 rounded-[32px] rounded-tr-lg' : 'bg-[#0a0a0a] border border-white/5 p-8 rounded-[40px] rounded-tl-lg shadow-2xl shadow-black'}`}>
                {m.type === 'text' && (
                  <div className="prose prose-invert max-w-none">
                    <p className={`text-[16px] md:text-[17px] leading-[1.7] font-medium ${m.role === 'user' ? 'font-bold' : 'text-slate-200'}`}>
                      {m.content}
                    </p>
                  </div>
                )}
                {m.type === 'image' && (
                  <div className="space-y-4">
                    <img src={m.content} className="rounded-3xl w-full shadow-2xl border border-white/10 hover:scale-[1.02] transition-transform duration-500" />
                    <button className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-white transition-colors">
                      <Download size={14} />
                      <span>Yuklab olish (4K)</span>
                    </button>
                  </div>
                )}
                {m.groundingMetadata?.groundingChunks && (
                  <div className="mt-8 pt-8 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {m.groundingMetadata.groundingChunks.map((c: any, i: number) => (
                      (c.web || c.maps) && (
                        <a key={i} href={c.web?.uri || c.maps?.uri} target="_blank" className="flex items-center justify-between bg-white/5 px-5 py-4 rounded-2xl hover:bg-white/10 hover:border-amber-500/30 border border-transparent transition-all group">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-amber-500/60 uppercase font-black tracking-widest mb-1">{c.web ? 'Website' : 'Google Maps'}</span>
                            <span className="text-[11px] font-bold truncate max-w-[150px]">{c.web?.title || c.maps?.title}</span>
                          </div>
                          <ExternalLink size={14} className="text-white/40 group-hover:text-amber-500 transition-colors" />
                        </a>
                      )
                    ))}
                  </div>
                )}
                <div className={`mt-4 text-[9px] uppercase font-bold tracking-widest ${m.role === 'user' ? 'text-black/40' : 'text-white/20'}`}>
                  {new Date(m.timestamp).toLocaleTimeString()} • {m.role === 'user' ? 'You' : 'Anilo Assistant'}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center space-x-4 animate-pulse px-8">
              <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center">
                <Sparkles size={16} className="text-amber-500" />
              </div>
              <span className="text-xs uppercase tracking-[0.3em] font-black text-amber-500">Processing Node...</span>
            </div>
          )}
        </div>

        <div className="p-6 md:p-10">
          <div className="max-w-5xl mx-auto relative">
            <div className="absolute inset-0 bg-amber-500/5 blur-2xl -z-10 rounded-full" />
            <div className="flex items-end space-x-4 bg-[#0f0f0f] rounded-[36px] p-2.5 border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] focus-within:border-amber-500/30 transition-all">
              <div className="p-3">
                <button className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 transition-colors">
                  <Maximize2 size={18} />
                </button>
              </div>
              <textarea 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                placeholder={activeTab === 'dev' ? "Kod yoki terminal buyrug'i so'rang..." : "Anilo Studio bilan muloqotni boshlang..."} 
                className="flex-1 bg-transparent border-none outline-none py-5 px-2 text-white resize-none text-[16px] font-medium placeholder:text-white/10 min-h-[60px] max-h-[200px]" 
                rows={1} 
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              />
              <div className="p-3 flex space-x-2">
                <button onClick={handleSendMessage} disabled={!input.trim() || isLoading} className="h-[52px] w-[52px] flex items-center justify-center bg-amber-500 rounded-[22px] text-black disabled:opacity-10 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-amber-500/20">
                  {isLoading ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex justify-center mt-8 space-x-10 md:hidden pb-4">
             <TabIcon icon={<Bot size={22} />} active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
             <TabIcon icon={<Activity size={22} />} active={activeTab === 'live'} onClick={() => setActiveTab('live')} />
             <TabIcon icon={<ImageIcon size={22} />} active={activeTab === 'images'} onClick={() => setActiveTab('images')} />
             <TabIcon icon={<Terminal size={22} />} active={activeTab === 'dev'} onClick={() => setActiveTab('dev')} />
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`w-full group flex items-center space-x-4 p-4 rounded-3xl transition-all duration-300 ${active ? 'bg-amber-500/10 text-white' : 'text-slate-500 hover:bg-white/5'}`}>
      <div className={`p-3 rounded-2xl transition-all duration-500 ${active ? 'bg-amber-500 text-black shadow-2xl shadow-amber-500/40 rotate-3' : 'bg-[#111] group-hover:bg-[#181818]'}`}>
        {icon}
      </div>
      <span className={`font-black text-[11px] uppercase tracking-[0.2em] transition-all ${active ? 'opacity-100 translate-x-1' : 'opacity-60 group-hover:opacity-100'}`}>
        {label}
      </span>
    </button>
  );
}

function TabIcon({ icon, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`transition-all duration-300 ${active ? 'text-amber-500 scale-125' : 'text-white/20'}`}>
      {icon}
    </button>
  );
}

function DevActionCard({ title, cmd, desc }: { title: string, cmd: string, desc: string }) {
  const [copied, setCopied] = useState(false);
  
  const copy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#0f0f0f] border border-white/5 p-6 rounded-[32px] text-left hover:border-amber-500/30 transition-all group">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[11px] font-black uppercase tracking-widest text-amber-500">{title}</h4>
        <ShieldCheck size={14} className="text-green-500" />
      </div>
      <p className="text-[12px] text-white/40 mb-4">{desc}</p>
      <div className="relative">
        <code className="block bg-black p-4 rounded-2xl text-[11px] font-mono text-amber-500/80 break-all border border-white/5 group-hover:border-amber-500/20 transition-all">
          {cmd}
        </code>
        <button onClick={copy} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
          {copied ? <Zap size={14} className="text-green-500" /> : <Code size={14} className="text-white/40" />}
        </button>
      </div>
    </div>
  );
}
