import React, { useState, useEffect, useRef } from 'react';
import { AppState, GenerationSettings, StylePreset, LightingOption, GenerationResult, DesignSuggestion, ProductItem, BudgetItem, RoomType } from './types';
import UploadZone from './components/UploadZone';
import MaskCanvas, { MaskCanvasHandle } from './components/MaskCanvas';
import ControlPanel from './components/ControlPanel';
import ShoppingPanel from './components/ShoppingPanel';
import BudgetPanel from './components/BudgetPanel';
import HistoryPanel from './components/HistoryPanel';
import WelcomeScreen from './components/WelcomeScreen'; 
import ThreeDViewer from './components/ThreeDViewer'; 
import { orchestrateDesign, generateRoomImage, detectRoomImprovements, analyzeShoppableItems, estimateRenovationCost, generateDepthMap } from './services/geminiService';
import { ArrowLeft, Check, Download, Info, Eye, Code, Sparkles, ChevronRight, Layers, PenTool, Box } from 'lucide-react';

export default function App() {
  const [showWelcome, setShowWelcome] = useState(true); // Intro State
  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [hasMask, setHasMask] = useState(false);
  const [previewBox, setPreviewBox] = useState<[number, number, number, number] | null>(null);
  
  const [settings, setSettings] = useState<GenerationSettings>({
    prompt: '',
    roomType: RoomType.LIVING_ROOM,
    style: StylePreset.MODERN,
    lighting: LightingOption.DAYLIGHT,
    creativity: 50,
    preserveStructure: true,
    autoSuggest: false
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [orchestratedInstruction, setOrchestratedInstruction] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 3D View State
  const [show3DViewer, setShow3DViewer] = useState(false);
  const [isGeneratingDepth, setIsGeneratingDepth] = useState(false);

  // Auto Suggestion State
  const [suggestions, setSuggestions] = useState<DesignSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Shopping & Budget State
  const [shoppingItems, setShoppingItems] = useState<ProductItem[]>([]);
  const [isShoppingLoading, setIsShoppingLoading] = useState(false);
  
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetHistory, setBudgetHistory] = useState<{ id: string, items: BudgetItem[] }[]>([]);
  const [isBudgetLoading, setIsBudgetLoading] = useState(false);

  const maskCanvasRef = useRef<MaskCanvasHandle>(null);

  const analyzeImage = async (image: string) => {
      setIsAnalyzing(true);
      setSuggestions([]); 
      try {
          const ideas = await detectRoomImprovements(image, settings.roomType);
          setSuggestions(ideas);
      } catch (e) {
          console.warn("Analysis failed", e);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleApplySuggestion = (suggestion: DesignSuggestion) => {
      const current = settings.prompt.trim();
      const separator = current.length > 0 ? " " : "";
      setSettings(prev => ({ ...prev, prompt: current + separator + suggestion.text }));
      if (suggestion.box_2d && maskCanvasRef.current) {
          maskCanvasRef.current.drawRect(suggestion.box_2d);
          setHasMask(true);
      }
      setPreviewBox(null);
  };

  const handleImageSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const img = e.target.result as string;
        setSourceImage(img);
        setAppState(AppState.EDITOR);
        setBudgetHistory([]); 
        setBudgetItems([]);
        setShoppingItems([]);
        setHistory([]);
        setHasMask(false);
        setPreviewBox(null);
        if (settings.autoSuggest) analyzeImage(img);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (settings.autoSuggest && sourceImage && suggestions.length === 0 && !isAnalyzing) {
        analyzeImage(sourceImage);
    }
  }, [settings.autoSuggest, sourceImage]);

  const handleGenerate = async () => {
    if (!sourceImage) return;

    setIsGenerating(true);
    setErrorMsg(null);
    setOrchestratedInstruction("");
    setShoppingItems([]); 
    setBudgetItems([]); 
    setPreviewBox(null);

    try {
      let maskBase64 = undefined;
      if (hasMask && maskCanvasRef.current) {
        const maskData = maskCanvasRef.current.getMaskData();
        if (maskData) maskBase64 = maskData;
      }

      const refinedPrompt = await orchestrateDesign(settings, sourceImage, maskBase64);
      setOrchestratedInstruction(refinedPrompt);

      const generatedImageBase64 = await generateRoomImage(sourceImage, refinedPrompt, maskBase64);
      
      const newResult: GenerationResult = {
        id: Date.now().toString(),
        imageUrl: generatedImageBase64,
        promptUsed: refinedPrompt,
        timestamp: Date.now(),
        sourceImage: sourceImage,
        settings: { ...settings }
      };
      
      setResult(newResult);
      setHistory(prev => [newResult, ...prev]);
      setAppState(AppState.RESULTS);

      setIsShoppingLoading(true);
      analyzeShoppableItems(generatedImageBase64, maskBase64).then(setShoppingItems).finally(() => setIsShoppingLoading(false));

      setIsBudgetLoading(true);
      estimateRenovationCost(generatedImageBase64, maskBase64, settings.roomType).then(items => {
              setBudgetItems(items);
              setBudgetHistory(prev => [...prev, { id: newResult.id, items }]);
          }).finally(() => setIsBudgetLoading(false));

    } catch (e: any) {
      setErrorMsg(e.message || "An error occurred during generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRestoreHistory = (historyItem: GenerationResult) => {
      setResult(historyItem);
      setSourceImage(historyItem.sourceImage);
      setSettings(historyItem.settings);
      setShoppingItems([]);
      setBudgetItems([]); 
      setPreviewBox(null);
  };

  const handleRefineResult = () => {
    if (result) {
        const newSource = result.imageUrl;
        setSourceImage(newSource);
        setAppState(AppState.EDITOR);
        setHasMask(false);
        setResult(null);
        setOrchestratedInstruction("");
        setSuggestions([]);
        setShoppingItems([]);
        setBudgetItems([]);
        setPreviewBox(null);
        if (settings.autoSuggest) analyzeImage(newSource);
    }
  };

  const handleStartOver = () => {
      if (window.confirm("Are you sure you want to start over? All current progress and history will be lost.")) {
          setAppState(AppState.UPLOAD);
          setSourceImage(null);
          setResult(null);
          setHasMask(false);
          setSuggestions([]);
          setShoppingItems([]);
          setBudgetItems([]);
          setBudgetHistory([]);
          setHistory([]);
          setPreviewBox(null);
          setSettings({
            prompt: '',
            roomType: RoomType.LIVING_ROOM,
            style: StylePreset.MODERN,
            lighting: LightingOption.DAYLIGHT,
            creativity: 50,
            preserveStructure: true,
            autoSuggest: false
          });
      }
  };

  const handleDownload = () => {
    if (result) {
      const link = document.createElement('a');
      link.href = result.imageUrl;
      link.download = `lumina-design-${result.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleView3D = async () => {
      if (!result) return;
      if (result.depthMapUrl) {
          setShow3DViewer(true);
          return;
      }
      
      setIsGeneratingDepth(true);
      try {
          const depthMap = await generateDepthMap(result.imageUrl);
          setResult(prev => prev ? { ...prev, depthMapUrl: depthMap } : null);
          setShow3DViewer(true);
      } catch (e) {
          console.error(e);
          setErrorMsg("Failed to generate 3D view");
      } finally {
          setIsGeneratingDepth(false);
      }
  };

  const currentBudgetRound = budgetHistory.length > 0 ? budgetHistory[budgetHistory.length - 1].items : [];
  const pastBudgetHistory = budgetHistory.length > 1 ? budgetHistory.slice(0, budgetHistory.length - 1) : [];

  return (
    <>
      {showWelcome && <WelcomeScreen onComplete={() => setShowWelcome(false)} />}
      
      <div className={`min-h-screen font-sans text-slate-200 pb-20 relative overflow-x-hidden selection:bg-primary/30 selection:text-white transition-opacity duration-1000 ${showWelcome ? 'opacity-0' : 'opacity-100'}`}>
        
        <div className="fixed inset-0 -z-10 bg-[#050209] overflow-hidden pointer-events-none">
          {/* Animated Background Gradients with Blob Animation */}
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-tertiary/20 rounded-full blur-[120px] animate-blob mix-blend-screen" />
          <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-primary/20 rounded-full blur-[100px] animate-blob mix-blend-screen" style={{animationDelay: '2s'}} />
          <div className="absolute bottom-[-10%] left-[20%] w-[45vw] h-[45vw] bg-secondary/10 rounded-full blur-[100px] animate-blob mix-blend-screen" style={{animationDelay: '4s'}} />
          
          {/* Noise Overlay */}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
        </div>

        {show3DViewer && result && result.depthMapUrl && (
            <ThreeDViewer 
               imageUrl={result.imageUrl}
               depthUrl={result.depthMapUrl}
               onClose={() => setShow3DViewer(false)}
            />
        )}

        <header className="sticky top-0 z-50 glass-panel border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.location.reload()}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-tertiary to-primary flex items-center justify-center shadow-lg shadow-primary/20 group-hover:rotate-12 transition-transform duration-300">
                <Sparkles size={20} className="text-white fill-white/20" />
              </div>
              <div>
                <span className="text-2xl font-display font-bold tracking-tight text-white block leading-none">Lumina</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Spaces</span>
              </div>
            </div>
            {appState !== AppState.UPLOAD && (
               <div className="flex gap-3">
                   <button 
                     type="button" 
                     onClick={handleStartOver}
                     disabled={isGenerating}
                     className="px-5 py-2 rounded-full text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 transition-all disabled:opacity-50"
                   >
                     Start Over
                   </button>
               </div>
            )}
          </div>
        </header>

        <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-8 md:py-12">
          {errorMsg && (
            <div className="mb-8 p-4 bg-red-900/20 backdrop-blur border border-red-500/30 text-red-200 rounded-2xl flex items-center gap-3 shadow-lg animate-fade-in max-w-2xl mx-auto">
               <Info size={20} className="flex-shrink-0 text-red-400" />
               {errorMsg}
            </div>
          )}

          {appState === AppState.UPLOAD && (
            <div className="max-w-4xl mx-auto mt-8 md:mt-24 animate-fade-in text-center relative">
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-24 w-96 h-96 bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
               <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-secondary uppercase tracking-widest mb-8 backdrop-blur-md">
                <Sparkles size={12} />
                AI Powered Architecture
              </div>
              <h1 className="text-5xl md:text-8xl font-display font-bold mb-8 tracking-tighter leading-[1] text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 drop-shadow-2xl">
                Redesign Reality
              </h1>
              <p className="text-slate-400 mb-12 text-lg md:text-xl max-w-xl mx-auto leading-relaxed font-light">
                Transform your environment with industrial-grade AI orchestration. <br className="hidden md:block"/>
                Upload, mask, and reimagine.
              </p>
              <div className="glass-panel p-2 rounded-[2.5rem] shadow-[0_0_50px_-20px_rgba(80,32,122,0.5)]">
                 <UploadZone onImageSelected={handleImageSelected} />
              </div>
            </div>
          )}

          {(appState === AppState.EDITOR || appState === AppState.GENERATING) && sourceImage && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 animate-fade-in">
              <div className="lg:col-span-8 flex flex-col gap-6">
                <div className="glass-panel rounded-[2rem] shadow-2xl overflow-hidden relative group border-white/10">
                   <div className="p-1">
                     <MaskCanvas ref={maskCanvasRef} imageSrc={sourceImage} onMaskChange={setHasMask} previewBox={previewBox} />
                   </div>
                   {isGenerating && (
                     <div className="absolute inset-0 z-50 bg-[#050209]/80 backdrop-blur-md flex flex-col items-center justify-center">
                        <div className="relative">
                          <div className="animate-spin rounded-full h-24 w-24 border-t-2 border-b-2 border-primary mb-8 shadow-[0_0_30px_rgba(255,72,185,0.4)]"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles size={24} className="text-primary animate-pulse" />
                          </div>
                        </div>
                        <p className="text-2xl font-display font-bold text-white animate-pulse tracking-tight">
                          {orchestratedInstruction ? "Constructing Reality..." : "Orchestrating..."}
                        </p>
                     </div>
                   )}
                </div>
                <div className="flex items-center gap-4 p-5 bg-tertiary/10 backdrop-blur rounded-2xl border border-tertiary/20 shadow-lg">
                  <div className="w-10 h-10 rounded-full bg-tertiary/20 flex items-center justify-center text-primary flex-shrink-0 border border-primary/20"><Info size={20} /></div>
                  <div className="text-sm text-slate-300">
                    <span className="block font-bold text-white mb-0.5">Smart Masking Active</span>
                    Draw roughly over objects (like frames). We will automatically expand your selection.
                  </div>
                </div>
              </div>
              <div className="lg:col-span-4">
                 <div className="glass-panel p-6 md:p-8 rounded-[2.5rem] sticky top-28 border border-white/10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)]">
                    <ControlPanel settings={settings} onChange={setSettings} isGenerating={isGenerating} onGenerate={handleGenerate} isValid={!!sourceImage} suggestions={suggestions} isAnalyzing={isAnalyzing} onApplySuggestion={handleApplySuggestion} onPreviewSuggestion={setPreviewBox} />
                 </div>
              </div>
            </div>
          )}

          {appState === AppState.RESULTS && result && (
             <div className="max-w-7xl mx-auto animate-fade-in">
                <div className="flex justify-between items-center mb-8">
                   <button onClick={() => setAppState(AppState.EDITOR)} className="group flex items-center gap-2 pl-4 pr-6 py-3 rounded-full bg-white/5 border border-white/10 text-slate-300 font-medium hover:bg-white/10 hover:text-white transition-all backdrop-blur-md">
                     <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                     Back to Original
                   </button>
                   
                   <div className="flex gap-4">
                      {/* View in 3D Button */}
                      <button 
                        onClick={handleView3D}
                        disabled={isGeneratingDepth}
                        className="bg-white/5 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50"
                      >
                        {isGeneratingDepth ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"/> : <Box size={20} />}
                        View in 3D
                      </button>

                      <button onClick={handleDownload} className="hidden md:flex bg-white/5 text-white px-6 py-3 rounded-2xl font-bold items-center gap-2 hover:bg-white/10 border border-white/10 transition-all">
                        <Download size={20} />
                        Export PNG
                      </button>
                      <button onClick={handleRefineResult} className="bg-primary hover:bg-pink-500 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(255,72,185,0.4)] transition-all hover:scale-105">
                        <Layers size={20} />
                        Refine This Output
                      </button>
                   </div>
                </div>

                <div className="glass-panel rounded-[3rem] overflow-hidden shadow-2xl border-white/10">
                   <div className="grid grid-cols-1 lg:grid-cols-2">
                      <div className="relative group border-b lg:border-b-0 lg:border-r border-white/10 h-[50vh] lg:h-[75vh] overflow-hidden">
                         <div className="absolute top-8 left-8 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-full z-10 border border-white/10 uppercase tracking-widest">Input Source</div>
                         <img src={sourceImage || ""} alt="Original" className="w-full h-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105 group-hover:opacity-100" />
                      </div>
                      <div className="relative group h-[50vh] lg:h-[75vh] overflow-hidden bg-black/40">
                         <div className="absolute top-8 left-8 bg-gradient-to-r from-primary/90 to-tertiary/90 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-full z-10 flex items-center gap-2 shadow-lg shadow-primary/20 border border-white/20 uppercase tracking-widest">
                            <Sparkles size={12} className="fill-current" />
                            Processed Result
                         </div>
                         <img src={result.imageUrl} alt="Generated" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                         <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-end justify-between translate-y-4 group-hover:translate-y-0">
                            <button onClick={handleRefineResult} className="bg-white text-black px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-secondary hover:text-white shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_20px_rgba(18,206,106,0.5)] active:scale-95 transition-all">
                               <PenTool size={20} />
                               Continue Editing
                            </button>
                         </div>
                      </div>
                   </div>
                </div>
                <HistoryPanel history={history} activeResultId={result.id} onSelectResult={handleRestoreHistory} />
                <ShoppingPanel items={shoppingItems} isLoading={isShoppingLoading} />
                <BudgetPanel currentItems={currentBudgetRound} history={pastBudgetHistory} isLoading={isBudgetLoading} />
             </div>
          )}
        </main>
      </div>
    </>
  );
}