
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Eraser, Brush, Trash2 } from 'lucide-react';

export interface MaskCanvasHandle {
  getMaskData: () => string | null;
  clearMask: () => void;
  drawRect: (box: [number, number, number, number]) => void; // box is [ymin, xmin, ymax, xmax] 0-1000
}

interface MaskCanvasProps {
  imageSrc: string;
  onMaskChange: (hasMask: boolean) => void;
  previewBox?: [number, number, number, number] | null; 
}

const MaskCanvas = forwardRef<MaskCanvasHandle, MaskCanvasProps>(({ imageSrc, onMaskChange, previewBox }, ref) => {
  const [brushSize, setBrushSize] = useState(40);
  const [mode, setMode] = useState<'brush' | 'eraser'>('brush');
  const [hasDrawn, setHasDrawn] = useState(false);
  
  const layerRef = useRef<{ 
      getMask: () => string | null; 
      clear: () => void;
      drawRect: (box: [number, number, number, number]) => void;
  }>(null);

  useImperativeHandle(ref, () => ({
    getMaskData: () => layerRef.current?.getMask() || null,
    clearMask: () => {
        layerRef.current?.clear();
        setHasDrawn(false);
        onMaskChange(false);
    },
    drawRect: (box) => {
        layerRef.current?.drawRect(box);
        setHasDrawn(true);
        onMaskChange(true);
    }
  }));
  
  return (
    <div className="flex flex-col h-full relative">
       <MaskLayer 
         ref={layerRef}
         imageSrc={imageSrc} 
         brushSize={brushSize} 
         mode={mode} 
         previewBox={previewBox}
         onMaskUpdate={(has) => {
             setHasDrawn(has);
             onMaskChange(has);
         }}
       />
       
       {/* Floating Toolbar - Earthy Organic */}
       <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-6 bg-background/80 backdrop-blur-xl p-3 pl-6 pr-8 rounded-full shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] border border-white/10 z-30 transition-all hover:scale-105 hover:border-secondary/30 group">
         
         {/* Tools */}
         <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-full border border-white/5">
           <button
             onClick={() => setMode('brush')}
             className={`p-3 rounded-full transition-all duration-300 ${mode === 'brush' ? 'bg-primary text-white shadow-[0_0_15px_rgba(106,122,90,0.5)]' : 'hover:bg-white/10 text-accent/50'}`}
             title="Brush"
           >
             <Brush size={18} />
           </button>
           <button
             onClick={() => setMode('eraser')}
             className={`p-3 rounded-full transition-all duration-300 ${mode === 'eraser' ? 'bg-pale text-background shadow-[0_0_15px_rgba(190,210,186,0.5)]' : 'hover:bg-white/10 text-accent/50'}`}
             title="Eraser"
           >
             <Eraser size={18} />
           </button>
         </div>
         
         <div className="w-px h-8 bg-white/10" />
         
         {/* Size Slider */}
         <div className="flex items-center gap-4">
           <span className="text-[10px] font-bold text-accent/40 uppercase tracking-widest">Brush Size</span>
           <input
             type="range"
             min="10"
             max="100"
             value={brushSize}
             onChange={(e) => setBrushSize(Number(e.target.value))}
             className="w-24 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white hover:accent-secondary transition-all"
           />
         </div>

         {hasDrawn && (
            <>
                <div className="w-px h-8 bg-white/10" />
                <button 
                  onClick={() => {
                      layerRef.current?.clear();
                      setHasDrawn(false);
                      onMaskChange(false);
                  }}
                  className="p-2 rounded-full hover:bg-white/10 text-accent/50 hover:text-red-400 transition-colors"
                  title="Clear Mask"
                >
                    <Trash2 size={16} />
                </button>
                <div className="w-px h-8 bg-white/10" />
                <span className="text-xs font-bold text-secondary flex items-center gap-2 uppercase tracking-wider">
                   <span className="w-2 h-2 rounded-full bg-secondary animate-pulse shadow-[0_0_10px_#AAC48C]"></span>
                   Active
                </span>
            </>
         )}
       </div>
    </div>
  );
});

const MaskLayer = forwardRef<{ 
    getMask: () => string | null; 
    clear: () => void; 
    drawRect: (box: [number, number, number, number]) => void;
}, {
    imageSrc: string; 
    brushSize: number; 
    mode: 'brush' | 'eraser';
    onMaskUpdate: (hasMask: boolean) => void;
    previewBox?: [number, number, number, number] | null;
}>(({ imageSrc, brushSize, mode, onMaskUpdate, previewBox }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const logicCanvasRef = useRef<HTMLCanvasElement>(null); 
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null); 
    const [isDrawing, setIsDrawing] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useImperativeHandle(ref, () => ({
        getMask: () => {
            return logicCanvasRef.current?.toDataURL('image/png') || null;
        },
        clear: () => {
            const width = dimensions.width;
            const height = dimensions.height;
            const maskCtx = maskCanvasRef.current?.getContext('2d');
            const logicCtx = logicCanvasRef.current?.getContext('2d');
            if (maskCtx && logicCtx) {
                maskCtx.clearRect(0, 0, width, height);
                logicCtx.clearRect(0, 0, width, height);
            }
        },
        drawRect: (box) => {
            const maskCanvas = maskCanvasRef.current;
            const maskCtx = maskCanvas?.getContext('2d');
            const logicCanvas = logicCanvasRef.current;
            const logicCtx = logicCanvas?.getContext('2d');
            
            if (maskCtx && logicCtx) {
                const w = maskCanvas.width;
                const h = maskCanvas.height;
                const paddingY = 20; 
                const paddingX = 20;

                const ymin = Math.max(0, box[0] - paddingY) / 1000 * h;
                const xmin = Math.max(0, box[1] - paddingX) / 1000 * w;
                const ymax = Math.min(1000, box[2] + paddingY) / 1000 * h;
                const xmax = Math.min(1000, box[3] + paddingX) / 1000 * w;

                const boxW = xmax - xmin;
                const boxH = ymax - ymin;

                maskCtx.globalCompositeOperation = 'source-over';
                maskCtx.fillStyle = 'rgba(106, 122, 90, 0.5)';
                maskCtx.shadowBlur = 0;
                maskCtx.fillRect(xmin, ymin, boxW, boxH);
                maskCtx.strokeStyle = 'rgba(106, 122, 90, 0.9)';
                maskCtx.lineWidth = 2;
                maskCtx.strokeRect(xmin, ymin, boxW, boxH);

                logicCtx.globalCompositeOperation = 'source-over';
                logicCtx.fillStyle = '#FFFFFF';
                logicCtx.shadowBlur = 0;
                logicCtx.fillRect(xmin, ymin, boxW, boxH);
            }
        }
    }));

    useEffect(() => {
        const bgCanvas = bgCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        const logicCanvas = logicCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        const container = containerRef.current;
        if(!bgCanvas || !maskCanvas || !logicCanvas || !overlayCanvas || !container) return;

        const loadImage = () => {
            if (container.clientWidth === 0) {
                setTimeout(loadImage, 100);
                return;
            }

            const img = new Image();
            img.src = imageSrc;
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const aspectRatio = img.width / img.height;
                const maxHeight = 700;
                const maxWidth = container.clientWidth;
                
                let renderHeight = maxHeight;
                let renderWidth = renderHeight * aspectRatio;

                if (renderWidth > maxWidth) {
                    renderWidth = maxWidth;
                    renderHeight = renderWidth / aspectRatio;
                }

                setDimensions({ width: renderWidth, height: renderHeight });

                [bgCanvas, maskCanvas, logicCanvas, overlayCanvas].forEach(canvas => {
                    canvas.width = renderWidth;
                    canvas.height = renderHeight;
                });

                const ctx = bgCanvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, renderWidth, renderHeight);
            };
        };

        loadImage();
    }, [imageSrc]);

    useEffect(() => {
        const canvas = overlayCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || dimensions.width === 0) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (previewBox) {
            const w = canvas.width;
            const h = canvas.height;
            const padding = 20; 
            
            const ymin = Math.max(0, previewBox[0] - padding) / 1000 * h;
            const xmin = Math.max(0, previewBox[1] - padding) / 1000 * w;
            const ymax = Math.min(1000, previewBox[2] + padding) / 1000 * h;
            const xmax = Math.min(1000, previewBox[3] + padding) / 1000 * w;

            ctx.save();
            ctx.strokeStyle = '#AAC48C'; 
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]); 
            ctx.lineCap = 'round';
            ctx.shadowColor = '#AAC48C';
            ctx.shadowBlur = 10;
            
            ctx.strokeRect(xmin, ymin, xmax - xmin, ymax - ymin);
            ctx.fillStyle = 'rgba(170, 196, 140, 0.15)';
            ctx.fillRect(xmin, ymin, xmax - xmin, ymax - ymin);
            ctx.restore();
        }
    }, [previewBox, dimensions]);

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const maskCanvas = maskCanvasRef.current;
        const maskCtx = maskCanvas?.getContext('2d');
        const logicCanvas = logicCanvasRef.current;
        const logicCtx = logicCanvas?.getContext('2d');
        if (!maskCtx || !maskCanvas || !logicCtx) return;
        const rect = maskCanvas.getBoundingClientRect();
        let clientX, clientY;
        if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = (e as React.MouseEvent).clientX;
          clientY = (e as React.MouseEvent).clientY;
        }
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        [maskCtx, logicCtx].forEach(ctx => {
            ctx.lineWidth = brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        });

        if (mode === 'brush') {
            maskCtx.globalCompositeOperation = 'source-over';
            maskCtx.strokeStyle = 'rgba(106, 122, 90, 0.7)'; 
            maskCtx.shadowBlur = 5;
            maskCtx.shadowColor = '#6A7A5A';
            logicCtx.globalCompositeOperation = 'source-over';
            logicCtx.strokeStyle = '#FFFFFF'; 
            logicCtx.shadowBlur = 0;
        } else {
            maskCtx.globalCompositeOperation = 'destination-out';
            maskCtx.strokeStyle = 'rgba(0,0,0,1)';
            maskCtx.shadowBlur = 0;
            logicCtx.globalCompositeOperation = 'destination-out';
            logicCtx.strokeStyle = 'rgba(0,0,0,1)';
        }

        maskCtx.lineTo(x, y);
        maskCtx.stroke();
        maskCtx.beginPath();
        maskCtx.moveTo(x, y);
        logicCtx.lineTo(x, y);
        logicCtx.stroke();
        logicCtx.beginPath();
        logicCtx.moveTo(x, y);
    }

    const start = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        onMaskUpdate(true);
        const maskCtx = maskCanvasRef.current?.getContext('2d');
        const logicCtx = logicCanvasRef.current?.getContext('2d');
        maskCtx?.beginPath();
        logicCtx?.beginPath();
        draw(e);
    };

    const end = () => {
        setIsDrawing(false);
        const maskCtx = maskCanvasRef.current?.getContext('2d');
        const logicCtx = logicCanvasRef.current?.getContext('2d');
        maskCtx?.beginPath();
        logicCtx?.beginPath();
    }

    return (
        <div ref={containerRef} className="relative w-full flex justify-center bg-background/40 rounded-3xl overflow-hidden min-h-[500px]">
            <canvas ref={bgCanvasRef} className="absolute top-0 left-auto z-10 opacity-60" />
            <canvas ref={logicCanvasRef} className="absolute top-0 left-auto z-0 opacity-0 pointer-events-none" /> 
            <canvas ref={overlayCanvasRef} className="absolute top-0 left-auto z-30 pointer-events-none" /> 
            <canvas 
                ref={maskCanvasRef}
                className="relative z-20 cursor-crosshair touch-none mix-blend-screen"
                onMouseDown={start}
                onMouseMove={draw}
                onMouseUp={end}
                onMouseLeave={end}
                onTouchStart={start}
                onTouchMove={draw}
                onTouchEnd={end}
            />
            <div className="absolute inset-0 z-0 opacity-10" style={{backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>
        </div>
    )
});

MaskCanvas.displayName = "MaskCanvas";
MaskLayer.displayName = "MaskLayer";

export default MaskCanvas;
