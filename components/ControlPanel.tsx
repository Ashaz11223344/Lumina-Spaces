
import React, { useState } from 'react';
import { StylePreset, LightingOption, GenerationSettings, DesignSuggestion, RoomType, UserProfile, SavedPreset } from '../types';
import { Sparkles, Zap, Sun, Palette, Wand2, BrainCircuit, Plus, MousePointerClick, LayoutTemplate, Bookmark, Save, ChevronRight } from 'lucide-react';

interface ControlPanelProps {
  settings: GenerationSettings;
  onChange: (newSettings: GenerationSettings) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  isValid: boolean;
  suggestions: DesignSuggestion[];
  isAnalyzing: boolean;
  onApplySuggestion: (suggestion: DesignSuggestion) => void;
  onPreviewSuggestion: (box: [number, number, number, number] | null) => void;
  user: UserProfile | null;
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: SavedPreset) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  settings, 
  onChange, 
  isGenerating, 
  onGenerate, 
  isValid,
  suggestions,
  isAnalyzing,
  onApplySuggestion,
  onPreviewSuggestion,
  user,
  onSavePreset,
  onLoadPreset
}) => {
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [presetName, setPresetName] = useState('');

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...settings, prompt: e.target.value });
  };

  const handleSavePreset = () => {
    if (presetName.trim()) {
      onSavePreset(presetName.trim());
      setPresetName('');
      setShowPresetInput(false);
    }
  };

  return (
    <div className="space-y-10">
      
      {/* Presets Bar */}
      {user && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-bold text-accent uppercase tracking-widest">
              <Bookmark size={16} className="text-secondary" />
              Presets
            </label>
            <button 
              onClick={() => setShowPresetInput(!showPresetInput)}
              className="text-[10px] font-black uppercase tracking-widest text-secondary hover:text-white transition-colors"
            >
              {showPresetInput ? 'Cancel' : 'Save New'}
            </button>
          </div>

          {showPresetInput && (
            <div className="flex gap-2 animate-fade-down">
              <input 
                type="text" 
                placeholder="Preset Name..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-secondary"
              />
              <button 
                onClick={handleSavePreset}
                className="bg-secondary text-background p-2 rounded-xl hover:bg-pale transition-all"
              >
                <Save size={16} />
              </button>
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {user.preferences.savedPresets.map(p => (
              <button
                key={p.id}
                onClick={() => onLoadPreset(p)}
                className="flex-shrink-0 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-accent/70 hover:bg-white/10 hover:text-white transition-all whitespace-nowrap"
              >
                {p.name}
              </button>
            ))}
            {user.preferences.savedPresets.length === 0 && !showPresetInput && (
              <p className="text-[10px] text-accent/20 uppercase tracking-widest py-2">No presets saved yet</p>
            )}
          </div>
        </div>
      )}

      {/* Auto Suggestor Toggle & Output */}
      <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-4 relative overflow-hidden">
         {settings.autoSuggest && (
             <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/10 blur-[50px] rounded-full pointer-events-none" />
         )}

         <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className={`p-2 rounded-lg ${settings.autoSuggest ? 'bg-secondary text-background' : 'bg-white/10 text-accent/50'}`}>
                  <BrainCircuit size={18} />
               </div>
               <div>
                  <h3 className="text-sm font-bold text-white leading-none">Auto Suggestor</h3>
                  <p className="text-[10px] text-accent/40 mt-1">AI detects opportunities</p>
               </div>
            </div>
            
            <button 
              onClick={() => onChange({ ...settings, autoSuggest: !settings.autoSuggest })}
              className={`w-12 h-7 rounded-full transition-colors relative ${settings.autoSuggest ? 'bg-secondary' : 'bg-white/10'}`}
            >
               <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${settings.autoSuggest ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
         </div>

         <div className="transition-all duration-500">
             {settings.autoSuggest && isAnalyzing && (
                 <div className="flex flex-col items-center justify-center py-4 gap-3">
                     <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden relative">
                         <div className="absolute inset-0 bg-secondary animate-[shimmer_1s_infinite] w-1/2" />
                     </div>
                     <span className="text-xs text-secondary font-mono animate-pulse">SCANNING ROOM GEOMETRY...</span>
                 </div>
             )}

             {settings.autoSuggest && !isAnalyzing && suggestions.length > 0 && (
                 <div className="grid grid-cols-1 gap-2 mt-2">
                    {suggestions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => onApplySuggestion(s)}
                          onMouseEnter={() => s.box_2d && onPreviewSuggestion(s.box_2d)}
                          onMouseLeave={() => onPreviewSuggestion(null)}
                          className="group flex items-start gap-3 p-3 rounded-xl bg-background/40 hover:bg-white/10 border border-white/5 hover:border-secondary/50 text-left transition-all relative overflow-hidden"
                        >
                           <div className="absolute inset-0 bg-secondary/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
                           <div className="mt-0.5 text-secondary group-hover:scale-110 transition-transform relative z-10">
                              {s.box_2d ? <MousePointerClick size={14} /> : <Plus size={14} />}
                           </div>
                           <div className="relative z-10">
                               <span className="text-xs text-slate-300 group-hover:text-white leading-snug block">{s.text}</span>
                               {s.box_2d && <span className="text-[9px] text-secondary/40 uppercase tracking-widest font-bold">Auto-Select</span>}
                           </div>
                        </button>
                    ))}
                 </div>
             )}
         </div>
      </div>

      {/* Room Type Section */}
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-bold text-accent uppercase tracking-widest">
          <LayoutTemplate size={16} className="text-secondary" />
          Room Type
        </label>
        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
          {Object.values(RoomType).map(t => (
            <button
              key={t}
              onClick={() => onChange({...settings, roomType: t})}
              className={`
                px-3 py-2.5 text-xs rounded-xl font-medium transition-all duration-200 text-left flex items-center gap-2
                ${settings.roomType === t
                  ? 'bg-pale text-background shadow-[0_0_15px_rgba(190,210,186,0.3)]' 
                  : 'bg-white/5 text-accent/60 hover:bg-white/10 hover:text-white'
                }
              `}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${settings.roomType === t ? 'bg-secondary' : 'bg-white/20'}`} />
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Brief Section */}
      <div className="space-y-4">
        <label className="flex items-center justify-between text-sm font-bold text-accent uppercase tracking-widest">
          <span className="flex items-center gap-2">
            <Sparkles size={16} className="text-secondary" />
            Vision
          </span>
          <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-white/5 text-accent/50 border border-white/10">
            {settings.prompt.length} / 500
          </span>
        </label>
        <div className="relative group">
          <textarea
            value={settings.prompt}
            onChange={handleTextChange}
            placeholder="Describe the organic flow..."
            className="w-full h-32 p-5 rounded-2xl border border-white/10 bg-background/40 focus:bg-background/60 focus:ring-1 focus:ring-secondary focus:border-secondary transition-all resize-none text-white placeholder:text-accent/30 text-sm leading-relaxed shadow-inner"
            maxLength={500}
          />
        </div>
      </div>

      {/* Style Presets Grid */}
      <div className="space-y-4">
         <label className="flex items-center gap-2 text-sm font-bold text-accent uppercase tracking-widest">
           <Palette size={16} className="text-secondary" />
           Aesthetic
         </label>
         <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
           {Object.values(StylePreset).map(s => (s === StylePreset.MODERN ? StylePreset.MODERN : s)).map(s => (
             <button
               key={s}
               onClick={() => onChange({...settings, style: s})}
               className={`
                 relative px-4 py-3 text-xs rounded-xl font-medium transition-all duration-300 flex items-center justify-center text-center overflow-hidden group
                 ${settings.style === s
                   ? 'bg-primary text-white border border-secondary shadow-[0_0_15px_rgba(106,122,90,0.4)]' 
                   : 'bg-white/5 text-accent/60 border border-white/5 hover:bg-white/10 hover:text-white hover:border-white/20'
                 }
               `}
             >
               <span className="relative z-10">{s}</span>
             </button>
           ))}
         </div>
      </div>
      
      {/* Lighting Section */}
      <div className="space-y-4">
         <label className="flex items-center gap-2 text-sm font-bold text-accent uppercase tracking-widest">
           <Sun size={16} className="text-secondary" />
           Lighting
         </label>
         <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.values(LightingOption).map(l => (
               <button
                 key={l}
                 onClick={() => onChange({...settings, lighting: l})}
                 className={`
                   px-3 py-2.5 rounded-xl text-xs font-medium border transition-all duration-300
                   ${settings.lighting === l
                     ? 'border-secondary bg-secondary/10 text-secondary shadow-[0_0_10px_rgba(170,196,140,0.3)]' 
                     : 'border-white/5 bg-transparent text-accent/40 hover:bg-white/5 hover:text-white hover:border-white/10'
                   }
                 `}
               >
                 {l}
               </button>
            ))}
         </div>
      </div>

      {/* Creativity Slider */}
      <div className="space-y-5 pt-4 p-6 rounded-3xl bg-white/5 border border-white/5">
         <div className="flex justify-between items-center">
            <label className="text-sm font-bold text-accent uppercase tracking-widest">Creativity</label>
            <span className="text-xs font-mono font-bold text-secondary bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
                {settings.creativity}%
            </span>
         </div>
         <input 
            type="range"
            min="0"
            max="100"
            value={settings.creativity}
            onChange={(e) => onChange({...settings, creativity: Number(e.target.value)})}
            className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-secondary hover:accent-pale focus:outline-none"
         />
      </div>

      {/* Action Bar */}
      <div className="pt-4 sticky bottom-4 z-30">
        <button
          onClick={onGenerate}
          disabled={!isValid || isGenerating}
          className={`
            w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-500 relative overflow-hidden group
            ${!isValid || isGenerating 
              ? 'bg-white/5 text-accent/20 cursor-not-allowed border border-white/5' 
              : 'bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_auto] hover:bg-[right_center] text-white shadow-[0_0_30px_-5px_rgba(106,122,90,0.5)] border border-secondary/30 hover:scale-[1.02]'
            }
          `}
        >
          {isGenerating ? (
            <div className="flex items-center gap-4">
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Synchronizing...</span>
            </div>
          ) : (
            <>
              <Zap size={20} className="fill-current" />
              <span>Generate Design</span>
            </>
          )}
        </button>
      </div>

    </div>
  );
};

export default ControlPanel;
