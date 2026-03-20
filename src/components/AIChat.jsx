/* global process */
import { useState, useEffect, useRef } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import ReactMarkdown from "react-markdown";
import { Mic, Video, Search, MessageSquare, Send, Loader2, StopCircle, Globe, Play } from "lucide-react";

export default function AIChat() {
  const [mode, setMode] = useState("chat"); // chat, audio, video
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoUrl, setVideoUrl] = useState(null);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [searchGrounding, setSearchGrounding] = useState(true);
  const sessionRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      }
    };
    checkKey();
  }, []);

  const handleOpenKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };
  
  const chatEndRef = useRef(null);
  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages]);

  const API_KEY = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '';
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: "user", text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const config = {
        systemInstruction: "You are STEA AI, a helpful assistant for SwahiliTech Elite Academy. You speak Swahili and English. You provide tech tips, help with coding, and explain technology in simple terms.",
      };
      
      if (searchGrounding) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: input,
        config
      });

      const aiMsg = { 
        role: "ai", 
        text: response.text,
        grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: "ai", text: "Samahani, kuna tatizo limetokea. Tafadhali jaribu tena." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleVideoGenerate = async () => {
    if (!hasApiKey && window.aistudio) {
      await handleOpenKey();
    }
    if (!videoPrompt.trim()) return;
    setVideoLoading(true);
    setVideoUrl(null);
    
    try {
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: videoPrompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const response = await fetch(downloadLink, {
        method: 'GET',
        headers: {
          'x-goog-api-key': typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '',
        },
      });
      const blob = await response.blob();
      setVideoUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error("Video Error:", error);
      alert("Video generation failed. Please try again.");
    } finally {
      setVideoLoading(false);
    }
  };

  const playPCM = (base64) => {
    if (!audioContextRef.current) return;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i] / 0x7FFF;
    
    const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.start();
  };

  const handleAudioToggle = async () => {
    if (isRecording) {
      sessionRef.current?.close();
      audioStreamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioWorkletNodeRef.current = processor;
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are STEA AI, a helpful assistant for SwahiliTech Elite Academy. You speak Swahili and English. You provide tech tips, help with coding, and explain technology in simple terms.",
        },
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            setIsRecording(true);
          },
          onmessage: async (message) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              playPCM(base64Audio);
            }
            if (message.serverContent?.interrupted) {
              // Handle interruption
            }
          },
          onclose: () => {
            setIsRecording(false);
          },
          onerror: (err) => {
            console.error("Live Error:", err);
            setIsRecording(false);
          }
        }
      });
      sessionRef.current = session;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        session.sendRealtimeInput({
          audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

    } catch (err) {
      console.error("Mic Error:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  return (
    <div className="flex flex-col h-[80vh] bg-[#0d1019] rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5A623] to-[#FFD17C] flex items-center justify-center shadow-lg">
            <MessageSquare className="w-6 h-6 text-[#111]" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight">STEA AI Assistant</h2>
            <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Powered by Gemini 3</p>
          </div>
        </div>
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
          <button 
            onClick={() => setMode("chat")}
            className={`p-2 rounded-lg transition-all ${mode === "chat" ? "bg-[#F5A623] text-[#111]" : "text-white/60 hover:text-white"}`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setMode("audio")}
            className={`p-2 rounded-lg transition-all ${mode === "audio" ? "bg-[#F5A623] text-[#111]" : "text-white/60 hover:text-white"}`}
          >
            <Mic className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setMode("video")}
            className={`p-2 rounded-lg transition-all ${mode === "video" ? "bg-[#F5A623] text-[#111]" : "text-white/60 hover:text-white"}`}
          >
            <Video className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
        {mode === "chat" && (
          <>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                  <Globe className="w-10 h-10 text-[#F5A623]" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Karibu STEA AI</h3>
                  <p className="max-w-xs text-sm">Uliza chochote kuhusu teknolojia, coding, au STEA. Nitakujibu kwa Kiswahili au Kiingereza.</p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl ${msg.role === "user" ? "bg-[#F5A623] text-[#111] font-medium" : "bg-white/5 border border-white/10 text-white/90"}`}>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                  {msg.grounding?.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-2">Sources:</p>
                      <div className="flex flex-wrap gap-2">
                        {msg.grounding.map((chunk, j) => chunk.web && (
                          <a key={j} href={chunk.web.uri} target="_blank" rel="noreferrer" className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/10 transition-colors">
                            {chunk.web.title || "Source"}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#F5A623]" />
                  <span className="text-sm text-white/60">STEA AI anafikiria...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </>
        )}

        {mode === "audio" && (
          <div className="flex flex-col items-center justify-center h-full space-y-8 text-center">
            <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${isRecording ? "bg-red-500/20 scale-110 shadow-[0_0_50px_rgba(239,68,68,0.3)]" : "bg-white/5"}`}>
              <div className={`w-24 h-24 rounded-full flex items-center justify-center ${isRecording ? "bg-red-500 animate-pulse" : "bg-[#F5A623]"}`}>
                {isRecording ? <StopCircle className="w-10 h-10 text-white" /> : <Mic className="w-10 h-10 text-[#111]" />}
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold">{isRecording ? "STEA AI anakusikiliza..." : "Ongea na STEA AI"}</h3>
              <p className="text-white/40 max-w-xs mx-auto mt-2">Tumia sauti yako kuuliza maswali na kupata majibu ya papo hapo kwa sauti.</p>
            </div>
            <button 
              onClick={handleAudioToggle}
              className={`px-8 py-4 rounded-2xl font-bold transition-all ${isRecording ? "bg-red-500 text-white" : "bg-[#F5A623] text-[#111] hover:scale-105"}`}
            >
              {isRecording ? "Stop Conversation" : "Start Conversation"}
            </button>
          </div>
        )}

        {mode === "video" && (
          <div className="flex flex-col items-center justify-center h-full space-y-6">
            {!hasApiKey && window.aistudio && (
              <div className="w-full max-w-md p-6 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto">
                  <Globe className="w-6 h-6 text-yellow-500" />
                </div>
                <div>
                  <h4 className="font-bold text-yellow-500">API Key Required</h4>
                  <p className="text-sm text-yellow-500/60 mt-1">Video generation requires a paid Google Cloud API key. Please select one to continue.</p>
                </div>
                <button 
                  onClick={handleOpenKey}
                  className="w-full py-3 bg-yellow-500 text-[#111] font-bold rounded-xl hover:bg-yellow-400 transition-all"
                >
                  Select API Key
                </button>
                <p className="text-[10px] text-yellow-500/40">
                  See <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline">billing documentation</a> for more info.
                </p>
              </div>
            )}
            {videoUrl ? (
              <div className="w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl relative group">
                <video src={videoUrl} controls autoPlay loop className="w-full h-full object-cover" />
                <button 
                  onClick={() => setVideoUrl(null)}
                  className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4 text-center">
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Video className="w-10 h-10 text-[#F5A623]" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Veo Video Generation</h3>
                  <p className="text-sm text-white/40 max-w-xs">Tengeneza video fupi za kijanja kwa kutumia AI. Andika maelezo hapa chini.</p>
                </div>
              </div>
            )}
            
            <div className="w-full max-w-md space-y-4">
              <textarea 
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder="Mfano: Robot akicheza mpira kwenye mwezi, cinematic style..."
                className="w-100 h-32 p-4 rounded-2xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#F5A623] transition-colors resize-none"
              />
              <button 
                onClick={handleVideoGenerate}
                disabled={videoLoading || !videoPrompt.trim()}
                className="w-full py-4 rounded-2xl bg-[#F5A623] text-[#111] font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform"
              >
                {videoLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Inatengeneza video...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Generate Video
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      {mode === "chat" && (
        <div className="p-4 border-t border-white/10 bg-white/5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSearchGrounding(!searchGrounding)}
              className={`p-3 rounded-xl border transition-all ${searchGrounding ? "bg-[#F5A623]/20 border-[#F5A623] text-[#F5A623]" : "bg-white/5 border-white/10 text-white/40"}`}
              title="Toggle Google Search Grounding"
            >
              <Search className="w-5 h-5" />
            </button>
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Uliza chochote..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-[#F5A623] transition-colors"
            />
            <button 
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="p-3 bg-[#F5A623] text-[#111] rounded-xl font-bold disabled:opacity-50 hover:scale-105 transition-transform"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
