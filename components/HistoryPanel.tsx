import React from 'react';
import { GenerationResult } from '../types';
import { Clock } from 'lucide-react';

interface HistoryPanelProps {
  history: GenerationResult[];
  activeResultId: string;
  onSelectResult: (result: GenerationResult) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, activeResultId, onSelectResult }) => {
  if (history.length === 0) return null;

  return (
    <div className="mt-8 animate-fade-in">
      <div className="flex items-center gap-2 mb-4 px-2">
        <Clock size={16} className="text-slate-400" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Design Timeline</h3>
      </div>
      
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectResult(item)}
            className={`
              relative flex-shrink-0 w-48 rounded-2xl overflow-hidden border transition-all duration-300 snap-start group text-left
              ${item.id === activeResultId 
                ? 'border-primary ring-2 ring-primary/20 scale-[1.02] opacity-100' 
                : 'border-white/10 hover:border-white/30 opacity-60 hover:opacity-100'
              }
            `}
          >
            <div className="aspect-video bg-black/50 relative">
              <img src={item.imageUrl} alt="History thumbnail" className="w-full h-full object-cover" />
              {item.id === activeResultId && (
                <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                    <div className="bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-lg">Active</div>
                </div>
              )}
            </div>
            
            <div className="p-3 bg-white/5 backdrop-blur-md h-full">
              <p className="text-[10px] text-slate-400 font-mono mb-1">
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-xs text-white font-medium truncate leading-tight mb-1">
                 {item.settings.style} {item.settings.roomType}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default HistoryPanel;