
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
  Zap
} from 'lucide-react';

// --- Constants for Gemini ---
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';
const VIDEO_MODEL = 'veo-3.1-fast-generate-preview';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  type: 'text' | 'image' | 'video' | 'live';
  groundingMetadata?: any;
  timestamp: number;
  status?: 'processing' | 'ready' | 'error';
  operationId?: string;
}

export default function LuminaryStudio() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'images' | 'videos' | 'live'>('chat');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (typeof window !== 'undefined' && (window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.log("Location access denied", err)
      );
    }
  }, []);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 4;
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

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
      if (activeTab === 'chat') {
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
    <div className="flex h-screen bg-[#050505] text-slate-100 overflow-hidden">
      <aside className="hidden md:flex w-72 bg-[#0a0a0a] border-r border-amber-900/20 flex-col p-6 space-y-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-500 rounded-2xl flex items-center justify-center"><Flame className="text-black" /></div>
          <h1 className="text-xl font-black italic uppercase">Anilo AI</h1>
        </div>
        <nav className="flex-1 space-y-2">
          <NavItem active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<Bot size={18} />} label="Chat" />
          <NavItem active={activeTab === 'live'} onClick={() => setActiveTab('live')} icon={<Activity size={18} />} label="Live" />
          <NavItem active={activeTab === 'images'} onClick={() => setActiveTab('images')} icon={<ImageIcon size={18} />} label="Images" />
        </nav>
      </aside>
      <main className="flex-1 flex flex-col relative bg-[#020202]">
        <header className="h-20 flex items-center justify-between px-6 border-b border-white/5 backdrop-blur-xl bg-black/40">
          <span className="text-amber-500 font-black uppercase text-xs tracking-widest">{activeTab} mode</span>
          {activeTab === 'live' && (
            <button onClick={startLiveSession} className={`px-6 py-2 rounded-full font-bold text-xs uppercase ${isLive ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'}`}>
              {isLive ? 'Stop' : 'Start Live'}
            </button>
          )}
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-6 rounded-[32px] ${m.role === 'user' ? 'bg-amber-600' : 'bg-[#0a0a0a] border border-white/5'}`}>
                {m.type === 'text' && <p className="text-[16px] leading-relaxed">{m.content}</p>}
                {m.type === 'image' && <img src={m.content} className="rounded-2xl w-full" />}
              </div>
            </div>
          ))}
          {isLoading && <Loader2 className="animate-spin text-amber-500 mx-auto" />}
        </div>
        <div className="p-6">
          <div className="max-w-4xl mx-auto flex items-end space-x-4 bg-[#0d0d0d] rounded-[32px] p-2 border border-white/10">
            <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Xabar yo'llang..." className="flex-1 bg-transparent border-none outline-none p-4 text-white resize-none" rows={1} />
            <button onClick={handleSendMessage} className="p-4 bg-amber-500 rounded-2xl text-black"><Send size={20} /></button>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center space-x-4 p-4 rounded-2xl transition-all ${active ? 'bg-amber-500/10 text-white' : 'text-slate-500 hover:bg-white/5'}`}>
      <div className={`p-2 rounded-lg ${active ? 'bg-amber-500 text-black' : 'bg-black'}`}>{icon}</div>
      <span className="font-bold text-sm uppercase">{label}</span>
    </button>
  );
}

function QuickAction({ label, onClick }: any) {
  return (
    <button onClick={onClick} className="bg-white/5 p-6 rounded-3xl text-xs font-black uppercase text-slate-400 hover:text-amber-500 border border-transparent hover:border-amber-500/30 transition-all">
      {label}
    </button>
  );
}
