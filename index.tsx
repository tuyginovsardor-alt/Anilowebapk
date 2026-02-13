
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
  Maximize2
} from 'lucide-react';

// --- Constants ---
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

  // Initial setup
  useEffect(() => {
    const checkKey = async () => {
      if (typeof window !== 'undefined' && (window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();

    // Get location for Maps grounding
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.log("Location access denied", err)
      );
    }
  }, []);

  // Audio Visualizer Logic
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
    ctx.strokeStyle = '#6366f1';
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
    if (isLive) {
      drawWaveform();
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, [isLive, drawWaveform]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const openKeySelector = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const decodeAudio = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
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
    if (isLive) {
      stopLiveSession();
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Setup Analyser for visualization
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 2048;
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
              const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
              });
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              const decoded = decodeAudio(audioData);
              const buffer = await decodeAudioData(decoded, outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(analyser); // Connect to analyser before destination
              analyser.connect(outputCtx.destination);
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }
          },
          onclose: () => setIsLive(false),
          onerror: (e) => console.error("Live Error", e)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: 'You are Luminary, a premium studio assistant. Speak with elegance and precision.'
        }
      });

      liveSessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Mic access denied", err);
    }
  };

  const stopLiveSession = () => {
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
    setIsLive(false);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      type: 'text',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    const prompt = input;
    setInput('');
    setIsLoading(true);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

    try {
      if (activeTab === 'chat' || activeTab === 'live') {
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: prompt,
          config: { 
            tools: [{ googleSearch: {} }, { googleMaps: {} }],
            toolConfig: userLocation ? {
              retrievalConfig: { latLng: { latitude: userLocation.lat, longitude: userLocation.lng } }
            } : undefined
          },
        });

        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'model',
          content: response.text || "No response received.",
          type: 'text',
          groundingMetadata: response.candidates?.[0]?.groundingMetadata,
          timestamp: Date.now(),
        }]);
      } else if (activeTab === 'images') {
        const response = await ai.models.generateContent({
          model: IMAGE_MODEL,
          contents: prompt,
          config: { imageConfig: { aspectRatio: "1:1" } }
        });

        let imageUrl = '';
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }

        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'model',
          content: imageUrl || "Failed to generate image.",
          type: 'image',
          timestamp: Date.now(),
        }]);
      } else if (activeTab === 'videos') {
        if (!hasApiKey) await openKeySelector();

        const operation = await ai.models.generateVideos({
          model: VIDEO_MODEL,
          prompt: prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });

        const videoMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          content: "Synthesizing cinematic motion...",
          type: 'video',
          status: 'processing',
          operationId: operation.name,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, videoMsg]);
        pollVideoStatus(operation.name, videoMsg.id);
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: `Synthesis failed: ${error.message || 'Network error.'}`,
        type: 'text',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const pollVideoStatus = async (operationName: string, messageId: string) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    let isDone = false;
    let attempts = 0;

    while (!isDone && attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      attempts++;
      try {
        let operation = await ai.operations.getVideosOperation({ operation: { name: operationName } });
        if (operation.done) {
          isDone = true;
          const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
          const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
          const blob = await videoResponse.blob();
          const videoUrl = URL.createObjectURL(blob);
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: videoUrl, status: 'ready' } : m));
        }
      } catch (e) { console.error("Polling error", e); }
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-slate-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex w-72 bg-[#0a0a0a] border-r border-white/5 flex-col p-6 space-y-8 z-20">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-2xl shadow-indigo-500/20">
            <Sparkles size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase italic">Luminary</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<Bot size={18} />} label="Neural Core" desc="Search & Logic" />
          <NavItem active={activeTab === 'live'} onClick={() => setActiveTab('live')} icon={<Activity size={18} />} label="Vocal Link" desc="Live Synthesis" />
          <NavItem active={activeTab === 'images'} onClick={() => setActiveTab('images')} icon={<ImageIcon size={18} />} label="Visual Lab" desc="Creative Engine" />
          <NavItem active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} icon={<VideoIcon size={18} />} label="Cinema Hub" desc="Veo 3.1 Studio" />
        </nav>

        {isLive && (
          <div className="p-5 bg-indigo-500/5 border border-indigo-500/20 rounded-3xl space-y-4">
             <canvas ref={canvasRef} width={200} height={40} className="w-full h-10" />
             <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-indigo-400">
               <span>Live Link</span>
               <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
             </div>
          </div>
        )}

        <div className="pt-4 border-t border-white/5">
          <button onClick={() => setMessages([])} className="w-full flex items-center space-x-3 text-slate-500 hover:text-red-400 transition-colors px-4 py-2 text-sm">
            <Trash2 size={16} />
            <span>Purge Memory</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/5 blur-[140px] rounded-full -z-10 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full -z-10" />

        <header className="h-20 flex items-center justify-between px-8 border-b border-white/5 backdrop-blur-3xl bg-black/40 sticky top-0 z-10">
          <div className="flex items-center space-x-4">
            <div className="bg-white/5 p-2 rounded-lg md:hidden"><Bot size={18} /></div>
            <span className="text-slate-500 text-[10px] font-black tracking-[0.3em] uppercase opacity-50">Studio Control</span>
            <ChevronRight size={14} className="text-slate-800" />
            <span className="text-white font-bold capitalize text-sm">{activeTab} Environment</span>
          </div>
          <div className="flex items-center space-x-4">
            {activeTab === 'live' && (
              <button onClick={startLiveSession} className={`flex items-center space-x-2 px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-[0.2em] transition-all ${isLive ? 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-lg shadow-red-500/5' : 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 hover:scale-105'}`}>
                {isLive ? <MicOff size={14} /> : <Mic size={14} />}
                <span>{isLive ? 'Terminate' : 'Initiate Live'}</span>
              </button>
            )}
            <div className="hidden sm:flex items-center space-x-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-[10px] text-slate-300 font-mono tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span>STABLE LINK</span>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-10 scroll-smooth">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-12">
              <div className="relative group">
                <div className="absolute inset-0 bg-indigo-500 blur-[100px] opacity-10 group-hover:opacity-20 transition-opacity" />
                <Bot size={80} className="text-indigo-500 relative animate-float" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter italic uppercase">Creative OS</h2>
                <p className="text-slate-400 text-lg md:text-xl font-light max-w-md mx-auto leading-relaxed">Multimodal synthesis engine powered by Gemini 3.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full px-4">
                <QuickAction label="Nearby high-end restaurants?" onClick={() => setInput("Can you find some top-rated restaurants near me? Use my location.")} />
                <QuickAction label="Generate cinematic portrait" onClick={() => { setActiveTab('images'); setInput("Cinematic 8k portrait of a futuristic deity made of crystalline light."); }} />
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
              <div className={`max-w-[90%] md:max-w-[80%] flex space-x-4 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center mt-1 shadow-2xl ${msg.role === 'user' ? 'bg-indigo-600 shadow-indigo-500/20' : 'bg-white/5 border border-white/10'}`}>
                  {msg.role === 'user' ? <User size={20} /> : <Sparkles size={20} className="text-indigo-400" />}
                </div>
                <div className={`rounded-[32px] p-6 md:p-8 ${msg.role === 'user' ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-900/40' : 'bg-[#0f0f0f] border border-white/5 backdrop-blur-2xl'}`}>
                  {msg.type === 'text' && (
                    <div className="space-y-6">
                      <p className="text-[16px] leading-relaxed font-medium select-text">{msg.content}</p>
                      {msg.groundingMetadata?.groundingChunks && (
                        <div className="mt-8 pt-6 border-t border-white/5">
                          <div className="flex items-center space-x-2 text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] mb-4 opacity-50">
                            <MapPin size={12} />
                            <span>Verification Layer</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {msg.groundingMetadata.groundingChunks.map((chunk: any, i: number) => (
                              (chunk.web || chunk.maps) && (
                                <a key={i} href={chunk.web?.uri || chunk.maps?.uri} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between bg-white/5 hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/30 px-5 py-3 rounded-2xl transition-all">
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-[11px] text-slate-200 group-hover:text-indigo-400 transition-colors truncate font-bold uppercase tracking-wider">{chunk.web?.title || chunk.maps?.title || 'Location Info'}</span>
                                    <span className="text-[9px] text-slate-500 truncate">{chunk.web?.uri || chunk.maps?.uri}</span>
                                  </div>
                                  <ExternalLink size={12} className="text-slate-700 group-hover:text-indigo-500 flex-shrink-0" />
                                </a>
                              )
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {msg.type === 'image' && (
                    <div className="space-y-4">
                      <div className="relative group rounded-3xl overflow-hidden border border-white/10 shadow-3xl">
                        <img src={msg.content} alt="AI Gen" className="w-full h-auto transition-transform duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-4">
                           <a href={msg.content} download className="p-3 bg-white/10 backdrop-blur-md rounded-2xl hover:bg-white/20 transition-colors"><Download size={20} /></a>
                           <button className="p-3 bg-white/10 backdrop-blur-md rounded-2xl hover:bg-white/20 transition-colors"><Maximize2 size={20} /></button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between px-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <span>LUMINARY VISUAL ENGINE v2.5</span>
                        <span>1024x1024 . PNG</span>
                      </div>
                    </div>
                  )}
                   {msg.type === 'video' && (
                    <div className="space-y-4 min-w-[300px] md:min-w-[480px]">
                      {msg.status === 'processing' ? (
                        <div className="aspect-video bg-indigo-500/5 rounded-[40px] flex flex-col items-center justify-center border border-indigo-500/20 space-y-6 p-12">
                          <div className="relative">
                            <Loader2 size={48} className="text-indigo-500 animate-spin" />
                            <Sparkles size={16} className="absolute -top-2 -right-2 text-indigo-400 animate-pulse" />
                          </div>
                          <div className="text-center space-y-2">
                             <p className="text-lg font-black tracking-tighter uppercase italic">Synthesizing Temporal Layers</p>
                             <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em]">Veo 3.1 Pro Engine Active ... 2:45 remaining</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                           <video controls className="w-full aspect-video rounded-[32px] border border-white/10 shadow-3xl" src={msg.content} />
                           <div className="flex items-center justify-between px-4">
                              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Cinema Studio Output . MP4</span>
                              <a href={msg.content} download className="text-indigo-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest flex items-center space-x-2">
                                <Download size={14} />
                                <span>Export</span>
                              </a>
                           </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex space-x-4 animate-pulse">
                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center mt-1">
                  <Bot size={20} className="text-indigo-500 animate-spin" />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-[32px] px-8 py-5 flex items-center space-x-4">
                   <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                   </div>
                   <span className="text-xs font-black uppercase tracking-widest text-slate-500">Processing Node</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 md:p-8 bg-gradient-to-t from-black via-black/80 to-transparent">
          <div className="max-w-4xl mx-auto">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[32px] blur opacity-10 group-focus-within:opacity-30 transition-opacity duration-700" />
              <div className="relative bg-[#0d0d0d] border border-white/10 rounded-[28px] flex items-end p-2 pr-5 shadow-3xl backdrop-blur-3xl">
                <textarea 
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  placeholder={
                    activeTab === 'chat' ? "Query the neural core..." : 
                    activeTab === 'live' ? "Type context or activate Live..." :
                    activeTab === 'images' ? "Enter visual coordinates..." : 
                    "Prompt cinematic synthesis..."
                  }
                  className="w-full bg-transparent border-none outline-none focus:ring-0 p-5 text-slate-100 placeholder-slate-600 resize-none min-h-[64px] max-h-[200px] font-medium text-[16px]"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isLoading || !input.trim()}
                  className="mb-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-slate-800 p-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center justify-center"
                >
                  {isLoading ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center space-x-12 mt-6 opacity-30 select-none">
               <StatusItem icon={<Terminal size={14} />} label="Operational" />
               <StatusItem icon={<Search size={14} />} label="Grounding" />
               <StatusItem icon={<Volume2 size={14} />} label="Hi-Fi Audio" />
               <StatusItem icon={<MapPin size={14} />} label="Geo-Link" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, desc }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center space-x-4 p-4 rounded-[24px] transition-all duration-500 group ${active ? 'bg-white/5 text-white shadow-2xl' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}>
      <div className={`p-3 rounded-2xl transition-all duration-500 ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/40 rotate-12' : 'bg-black group-hover:bg-slate-900 group-hover:rotate-3'}`}>{icon}</div>
      <div className="text-left flex-1">
        <div className="font-bold text-sm tracking-tight">{label}</div>
        <div className="text-[10px] opacity-40 font-black uppercase tracking-[0.2em]">{desc}</div>
      </div>
      {active && <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,1)]" />}
    </button>
  );
}

function QuickAction({ label, onClick }: any) {
  return (
    <button onClick={onClick} className="bg-white/5 border border-white/5 hover:border-indigo-500/40 hover:bg-indigo-500/10 p-6 rounded-3xl text-sm text-slate-400 hover:text-indigo-300 transition-all text-left group flex items-center justify-between shadow-lg">
      <span className="font-bold tracking-tight uppercase tracking-widest text-[11px]">{label}</span>
      <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-3 group-hover:translate-x-0 text-indigo-500" />
    </button>
  );
}

function StatusItem({ icon, label }: any) {
  return (
    <div className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
      {icon}
      <span>{label}</span>
    </div>
  );
}
