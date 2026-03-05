
import React, { useRef, useEffect } from 'react';

interface VisualizerProps {
  isListening: boolean;
  isModelSpeaking: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isListening, isModelSpeaking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let startTime = Date.now();

    const draw = () => {
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 60;
      
      // Draw organic fluid background
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2);
      if (isModelSpeaking) {
        gradient.addColorStop(0, 'rgba(14, 165, 233, 0.2)');
        gradient.addColorStop(1, 'rgba(14, 165, 233, 0)');
      } else if (isListening) {
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
      } else {
        gradient.addColorStop(0, 'rgba(71, 85, 105, 0.1)');
        gradient.addColorStop(1, 'rgba(71, 85, 105, 0)');
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw concentric rings with organic wobble
      const baseAlpha = isListening || isModelSpeaking ? 0.8 : 0.2;
      const color = isModelSpeaking ? 'rgba(56, 189, 248,' : 'rgba(129, 140, 248,';

      for (let i = 0; i < 6; i++) {
        const speed = 3 + i * 2;
        const intensity = isListening || isModelSpeaking ? 25 : 5;
        const wobble = Math.sin(elapsed * speed + i) * intensity + Math.cos(elapsed * (speed * 0.5)) * (intensity * 0.5);
        const currentRadius = radius + (i * 12) + wobble;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}${baseAlpha / (i + 1)})`;
        ctx.lineWidth = 1 + (i * 0.5);
        ctx.setLineDash([2, 10, 5, 15]);
        ctx.lineDashOffset = -elapsed * (50 + i * 10);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Draw main center core
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 10, 0, Math.PI * 2);
      const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius - 10);
      if (isModelSpeaking) {
        coreGradient.addColorStop(0, '#7dd3fc');
        coreGradient.addColorStop(1, '#0ea5e9');
      } else if (isListening) {
        coreGradient.addColorStop(0, '#a5b4fc');
        coreGradient.addColorStop(1, '#6366f1');
      } else {
        coreGradient.addColorStop(0, '#64748b');
        coreGradient.addColorStop(1, '#334155');
      }
      ctx.fillStyle = coreGradient;
      ctx.shadowBlur = isListening || isModelSpeaking ? 30 : 10;
      ctx.shadowColor = isModelSpeaking ? '#0ea5e9' : '#6366f1';
      ctx.fill();
      ctx.shadowBlur = 0;

      animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [isListening, isModelSpeaking]);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-slate-900/50 rounded-3xl border border-slate-700/50 backdrop-blur-xl">
      <canvas 
        ref={canvasRef} 
        width={300} 
        height={300} 
        className="max-w-full"
      />
      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-slate-400 uppercase tracking-widest">
          {isModelSpeaking ? 'base75 is feeling you...' : (isListening ? 'base75 is listening...' : 'base75 is waiting for your soul')}
        </p>
      </div>
    </div>
  );
};
