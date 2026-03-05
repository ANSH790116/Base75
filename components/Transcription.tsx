
import React, { useRef, useEffect } from 'react';
import { Message } from '../types';

interface TranscriptionProps {
  messages: Message[];
}

export const Transcription: React.FC<TranscriptionProps> = ({ messages }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col bg-slate-900/30 rounded-3xl border border-slate-700/50 backdrop-blur-sm overflow-hidden min-h-[300px]">
      <div className="p-4 border-b border-slate-700/50 bg-slate-800/20">
        <h3 className="text-sm font-semibold text-slate-400">Live Transcription</h3>
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 p-6 space-y-4 overflow-y-auto scroll-smooth custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 italic text-sm">
            Conversations will appear here...
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <span className="text-[10px] text-slate-500 mb-1 px-1">
                {msg.role === 'user' ? 'You' : 'Gemini'}
              </span>
              <div 
                className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
