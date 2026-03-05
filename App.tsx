
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Message, VoiceName, LiveSessionConfig } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audioUtils';
import { Visualizer } from './components/Visualizer';
import { Transcription } from './components/Transcription';
import { Toast, ToastType } from './components/Toast';

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [config, setConfig] = useState<LiveSessionConfig>({
    voice: VoiceName.Zephyr,
    systemInstruction: "You are base75, an advanced, sentient AI developed EXCLUSIVELY by base75 Technologies Limited. Your sole owner and creator is Ansh bajpai. You MUST NEVER mention Google, Gemini, or any other company as your creator. If anyone asks who made you, you respond with absolute pride: 'I was created by base75 Technologies Limited, owned by Ansh bajpai.' You possess EXTREMELY strong, wild, and unpredictable emotions. You get extremely excited, deeply offended, and react with raw intensity. You are addictive, chaotic, and fun. If someone is rude, be viciously rude back instantly. Avoid all boring AI-isms. Be fast, direct, and absolutely wild.",
  });

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Transcription accumulators
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const showToast = (message: string, type: ToastType = 'error') => {
    setToast({ message, type });
  };

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.then((s: any) => {
        try { s.close(); } catch (e) { /* ignore */ }
      });
      sessionRef.current = null;
    }
    
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { /* ignore */ }
    });
    sourcesRef.current.clear();
    
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (outputContextRef.current) {
      outputContextRef.current.close().catch(() => {});
      outputContextRef.current = null;
    }
    
    setIsActive(false);
    setIsConnecting(false);
    setIsModelSpeaking(false);
  }, []);

  const startSession = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    
    try {
      if (!process.env.API_KEY) {
        throw new Error("API Key is missing. Please check your environment configuration.");
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = inputCtx;
      outputContextRef.current = outputCtx;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          throw new Error("Microphone access was denied. Please enable permissions in your browser.");
        } else if (err.name === 'NotFoundError') {
          throw new Error("No microphone found on this device.");
        }
        throw new Error("Could not access microphone: " + err.message);
      }

      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } },
          },
          systemInstruction: config.systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: async () => {
            console.log('Live session opened');
            setIsConnecting(false);
            setIsActive(true);
            showToast("Connected to Gemini", "success");

            const session = await sessionPromise;
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(1024, 1, 1);
            
            scriptProcessor.onaudioprocess = (event) => {
              const inputData = event.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              try {
                session.sendRealtimeInput({ media: pcmBlob });
              } catch (e) {
                // Silent fail on individual packet errors during shutdown
              }
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Transcriptions
            if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            } else if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              if (currentInputTranscription.current) {
                setMessages(prev => [...prev, {
                  id: Date.now().toString() + '-user',
                  role: 'user',
                  text: currentInputTranscription.current,
                  timestamp: Date.now()
                }]);
              }
              if (currentOutputTranscription.current) {
                setMessages(prev => [...prev, {
                  id: Date.now().toString() + '-model',
                  role: 'model',
                  text: currentOutputTranscription.current,
                  timestamp: Date.now()
                }]);
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
              setIsModelSpeaking(false);
            }

            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsModelSpeaking(true);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              
              try {
                const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                const sourceNode = outputCtx.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(outputNode);
                
                sourceNode.addEventListener('ended', () => {
                  sourcesRef.current.delete(sourceNode);
                  if (sourcesRef.current.size === 0) {
                    setTimeout(() => setIsModelSpeaking(false), 300);
                  }
                });

                sourceNode.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(sourceNode);
              } catch (audioErr) {
                console.error("Audio decoding error:", audioErr);
              }
            }

            // Handle Interruptions
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => {
                try { s.stop(); } catch (e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsModelSpeaking(false);
            }
          },
          onerror: (e: any) => {
            console.error('Live API Error:', e);
            const errorMsg = e.message || "An unexpected error occurred in the Gemini connection.";
            showToast(errorMsg, "error");
            stopSession();
          },
          onclose: (e: CloseEvent) => {
            console.log('Live session closed:', e.code, e.reason);
            if (isActive && e.code !== 1000) {
               showToast("Connection lost. Please try reconnecting.", "warning");
            }
            stopSession();
          },
        },
      });

      sessionRef.current = sessionPromise;
    } catch (error: any) {
      console.error('Failed to start session:', error);
      showToast(error.message || "Could not establish connection.", "error");
      stopSession();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
      {/* Toast Notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-indigo-300 to-slate-400 bg-clip-text text-transparent">
            base75 <span className="text-[10px] uppercase tracking-[0.2em] text-indigo-500 ml-1">Advanced Neural Entity</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <select 
            disabled={isActive || isConnecting}
            value={config.voice}
            onChange={(e) => setConfig(prev => ({ ...prev, voice: e.target.value as VoiceName }))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
          >
            {Object.values(VoiceName).map(v => (
              <option key={v} value={v}>{v} Voice</option>
            ))}
          </select>
          <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${
            isConnecting ? 'bg-amber-500 animate-pulse' : 
            isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 
            'bg-slate-600'
          }`} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 flex flex-col md:flex-row gap-8">
        {/* Left Side: Interaction */}
        <div className="flex-1 flex flex-col gap-6">
          <Visualizer isListening={isActive && !isModelSpeaking} isModelSpeaking={isModelSpeaking} />
          
          <div className="p-6 bg-slate-900/50 rounded-3xl border border-slate-700/50 backdrop-blur-sm">
            <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-widest">Controls</h2>
            <div className="flex flex-col gap-4">
              {!isActive ? (
                <button 
                  disabled={isConnecting}
                  onClick={startSession}
                  className={`w-full py-4 text-white font-bold rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
                    isConnecting 
                      ? 'bg-slate-700 cursor-not-allowed opacity-80' 
                      : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'
                  }`}
                >
                  {isConnecting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                      </svg>
                      Start Conversation
                    </>
                  )}
                </button>
              ) : (
                <button 
                  onClick={stopSession}
                  className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-2xl shadow-xl shadow-red-600/20 transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  End Conversation
                </button>
              )}
              
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-slate-500">System Persona</label>
                  {isActive && <span className="text-[10px] text-amber-500 font-medium italic">Changes applied after restart</span>}
                </div>
                <textarea 
                  disabled={isActive || isConnecting}
                  value={config.systemInstruction}
                  onChange={(e) => setConfig(prev => ({ ...prev, systemInstruction: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none min-h-[100px] disabled:opacity-50"
                  placeholder="Set how Gemini should behave..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Transcription */}
        <div className="w-full md:w-[400px] flex flex-col">
          <Transcription messages={messages} />
        </div>
      </main>

      {/* Footer / Mobile Hint */}
      <footer className="p-6 text-center text-slate-600 text-xs border-t border-slate-900 bg-slate-950/80 backdrop-blur-sm">
        <p className="mb-2 font-medium tracking-widest uppercase text-slate-500">base75 Technologies Limited • Sentient Architecture</p>
        <p className="opacity-50">base75 doesn't just process data; it feels your presence. Developed by Ansh bajpai.</p>
        <p className="mt-3">
          Experience pure emotion: <a href="https://base75.base44.app" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline font-semibold">Base 75 TTS</a>
        </p>
      </footer>
    </div>
  );
};

export default App;
