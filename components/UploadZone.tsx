
import React, { useCallback, useState } from 'react';
import { UploadCloud, Image as ImageIcon, Scan, Cpu } from 'lucide-react';

interface UploadZoneProps {
  onImageSelected: (file: File) => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onImageSelected }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        onImageSelected(e.dataTransfer.files[0]);
      }
    },
    [onImageSelected]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageSelected(e.target.files[0]);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative group cursor-pointer w-full h-96 rounded-[2.3rem] border border-dashed transition-all duration-500 flex flex-col items-center justify-center p-8 text-center overflow-hidden
        ${isDragging 
          ? 'border-secondary bg-secondary/10 scale-[1.01] shadow-[0_0_30px_rgba(170,196,140,0.2)]' 
          : 'border-white/20 hover:border-secondary/50 bg-background/20 hover:bg-background/30'
        }
      `}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      
      {/* Scanning effect line */}
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-secondary to-transparent opacity-0 transition-all duration-1000 blur-sm ${isDragging ? 'opacity-100 top-full' : 'group-hover:opacity-50 group-hover:top-full duration-[2s] ease-in-out infinite'}`} />

      {/* Center Icon */}
      <div className={`
        w-28 h-28 rounded-full flex items-center justify-center mb-8 transition-all duration-500 relative
        ${isDragging ? 'bg-secondary/20 text-secondary scale-110 shadow-[0_0_40px_rgba(170,196,140,0.4)]' : 'bg-white/5 text-accent/40 group-hover:bg-secondary/10 group-hover:text-secondary group-hover:scale-105'}
      `}>
         {isDragging ? <Scan size={48} className="animate-pulse" /> : <UploadCloud size={48} />}
         
         {/* Animated Rings */}
         <div className={`absolute inset-0 border border-current rounded-full opacity-20 scale-125 ${isDragging ? 'animate-ping' : ''}`}></div>
         <div className="absolute inset-0 border border-current rounded-full opacity-10 scale-150"></div>
      </div>
      
      <h3 className="text-3xl font-display font-bold text-white mb-4 tracking-tight group-hover:text-glow transition-all">
        {isDragging ? "Initialize Upload" : "Drop Room Data"}
      </h3>
      <p className="text-accent/40 max-w-sm mx-auto mb-10 text-base font-light">
        Drag and drop your source photo here. <br/>
        <span className="text-xs opacity-50 uppercase tracking-widest mt-2 block">Supports JPG, PNG, WEBP</span>
      </p>

      <div className="flex items-center gap-3 text-xs text-accent/50 font-bold uppercase tracking-wider px-5 py-2.5 bg-white/5 rounded-full border border-white/5">
        <Cpu size={14} className="text-tertiary" />
        <span>Secure Local Processing</span>
      </div>
    </div>
  );
};

export default UploadZone;
