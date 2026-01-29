
import React, { useState, useEffect, useRef } from 'react';
import { AppState, GenerationSettings, StylePreset, LightingOption, GenerationResult, DesignSuggestion, ProductItem, BudgetItem, RoomType, UserProfile, SavedPreset, Project } from './types';
import UploadZone from './components/UploadZone';
import MaskCanvas, { MaskCanvasHandle } from './components/MaskCanvas';
import ControlPanel from './components/ControlPanel';
import ShoppingPanel from './components/ShoppingPanel';
import BudgetPanel from './components/BudgetPanel';
import HistoryPanel from './components/HistoryPanel';
import WelcomeScreen from './components/WelcomeScreen'; 
import ThreeDViewer from './components/ThreeDViewer'; 
import LoginModal from './components/LoginModal';
import SettingsModal from './components/SettingsModal';
import ImageSlider from './components/ImageSlider';
import ProductVisualDiscovery from './components/ProductVisualDiscovery';
import { orchestrateDesign, generateRoomImage, detectRoomImprovements, analyzeShoppableItems, estimateRenovationCost, generateDepthMap } from './services/geminiService';
import { ArrowLeft, Download, Sparkles, Box, CheckCircle2, Save, Search, Wand2, Check, Layout as LayoutIcon, Maximize2, Ruler } from 'lucide-react';

export default function App() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [hasMask, setHasMask] = useState(false);
  const [previewBox, setPreviewBox] = useState<[number, number, number, number] | null>(null);
  
  // Auth & UI State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  // 3-Layout Batch State
  const [resultBatch, setResultBatch] = useState<GenerationResult[]>([]);
  const [activeLayoutIndex, setActiveLayoutIndex] = useState(0);
  const [batchData, setBatchData] = useState<{ [key: string]: { shopping: ProductItem[], budget: BudgetItem[] } }>({});

  // Discovery UI State
  const [showProductPins, setShowProductPins] = useState(true);

  const [settings, setSettings] = useState<GenerationSettings>({
    prompt: '',
    roomType: RoomType.LIVING_ROOM,
    style: StylePreset.MODERN,
    lighting: LightingOption.DAYLIGHT,
    creativity: 50,
    preserveStructure: true,
    autoSuggest: false,
    dimensions: undefined
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [orchestratedInstruction, setOrchestratedInstruction] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 3D View State
  const [show3DViewer, setShow3DViewer] = useState(false);
  const [isGeneratingDepth, setIsGeneratingDepth] = useState(false);

  // Auto Suggestion State
  const [suggestions, setSuggestions] = useState<DesignSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [isBatchDataLoading, setIsBatchDataLoading] = useState(false);

  const maskCanvasRef = useRef<MaskCanvasHandle>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [budgetHistory, setBudgetHistory] = useState<{ id: string, items: BudgetItem[] }[]>([]);

  useEffect(() => {
    const savedUser = localStorage.getItem('lumina_current_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        applyUserPreferences(parsedUser);
        const savedHistory = localStorage.getItem(`lumina_history_${parsedUser.id}`);
        if (savedHistory) setHistory(JSON.parse(savedHistory));
        const savedBudgets = localStorage.getItem(`lumina_budgets_${parsedUser.id}`);
        if (savedBudgets) setBudgetHistory(JSON.parse(savedBudgets));
      } catch (e) {
        localStorage.removeItem('lumina_current_user');
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (settings.autoSuggest && sourceImage && suggestions.length === 0 && !isAnalyzing) {
      analyzeImage(sourceImage);
    }
  }, [settings.autoSuggest, sourceImage]);

  const applyUserPreferences = (u: UserProfile) => {
    setSettings(prev => ({
      ...prev,
      roomType: u.preferences.defaultRoomType,
      style: u.preferences.defaultStyle,
      lighting: u.preferences.defaultLighting
    }));
  };

  const handleUpdateProfile = (updatedUser: UserProfile) => {
    setUser(updatedUser);
    localStorage.setItem('lumina_current_user', JSON.stringify(updatedUser));
  };

  const handleLogin = (newUser: UserProfile) => {
    setUser(newUser);
    applyUserPreferences(newUser);
    setShowLogin(false);
    localStorage.setItem('lumina_current_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setIsSigningOut(true);
    setTimeout(() => {
      setIsUserMenuOpen(false);
      setUser(null);
      localStorage.removeItem('lumina_current_user');
      setHistory([]);
      setBudgetHistory([]);
      setAppState(AppState.UPLOAD);
      setSourceImage(null);
      setResultBatch([]);
      setIsSigningOut(false);
    }, 400); 
  };

  useEffect(() => {
    if (user) {
      localStorage.setItem(`lumina_history_${user.id}`, JSON.stringify(history));
      localStorage.setItem(`lumina_budgets_${user.id}`, JSON.stringify(budgetHistory));
    }
  }, [history, budgetHistory, user]);

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
        setResultBatch([]);
        setBatchData({});
        setHasMask(false);
        setPreviewBox(null);
        if (settings.autoSuggest) analyzeImage(img);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!sourceImage) return;
    setIsGenerating(true);
    setErrorMsg(null);
    
    const hasDims = settings.dimensions && (settings.dimensions.length || settings.dimensions.width || settings.dimensions.height);
    setOrchestratedInstruction(hasDims ? `Architecting 1:1 Metric Layout...` : "Designing Structural Matrix...");
    
    setResultBatch([]);
    setBatchData({});
    setActiveLayoutIndex(0);

    try {
      let maskBase64 = undefined;
      if (hasMask && maskCanvasRef.current) {
        const maskData = maskCanvasRef.current.getMaskData();
        if (maskData) maskBase64 = maskData;
      }

      const baseConcept = await orchestrateDesign(settings, sourceImage, maskBase64);

      const layouts = [
        { name: "Curated Origin", instructions: "Keep existing furniture orientation but upgrade materials to real-world premium finishes (brass, marble, oak). 100% structural lock." },
        { name: "Bespoke Zoning", instructions: "Divide space into functional zones using real-world modular systems. Ensure 1:1 architectural preservation of walls and windows." },
        { name: "Stylistic Overlay", instructions: "Overlay aggressive stylistic textures while maintaining the exact immutable architectural layout of the source." }
      ];

      const generatedImages = await Promise.all(layouts.map(l => 
        generateRoomImage(sourceImage, `${baseConcept}. Priority: ${l.instructions}`, maskBase64)
      ));

      const newResults: GenerationResult[] = generatedImages.map((img, idx) => ({
        id: `layout-${Date.now()}-${idx}`,
        imageUrl: img,
        promptUsed: baseConcept + " | " + layouts[idx].name,
        timestamp: Date.now(),
        sourceImage: sourceImage,
        settings: { ...settings }
      }));

      setResultBatch(newResults);
      setHistory(prev => [...newResults, ...prev]);
      setAppState(AppState.RESULTS);

      setIsBatchDataLoading(true);
      const enrichment = await Promise.all(newResults.map(async (res) => {
        const [shopping, budget] = await Promise.all([
          analyzeShoppableItems(res.imageUrl, maskBase64, settings, baseConcept),
          estimateRenovationCost(res.imageUrl, maskBase64, settings.roomType)
        ]);
        return { id: res.id, shopping, budget };
      }));

      const newBatchData: typeof batchData = {};
      enrichment.forEach(e => {
        newBatchData[e.id] = { shopping: e.shopping, budget: e.budget };
      });
      setBatchData(newBatchData);
      setIsBatchDataLoading(false);

    } catch (e: any) {
      setErrorMsg(e.message || "An error occurred during matrix generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const currentResult = resultBatch[activeLayoutIndex];
  const currentBatchInfo = currentResult ? batchData[currentResult.id] : null;

  const handleRestoreHistory = (historyItem: GenerationResult) => {
      setResultBatch([historyItem]);
      setActiveLayoutIndex(0);
      setSourceImage(historyItem.sourceImage);
      setSettings(historyItem.settings);
      setAppState(AppState.RESULTS);
  };

  const handleChainDesign = () => {
    if (currentResult) {
        setSourceImage(currentResult.imageUrl);
        setAppState(AppState.EDITOR);
        setHasMask(false);
        setResultBatch([]);
        setBatchData({});
        setSettings(prev => ({ ...prev, prompt: '' }));
    }
  };

  const handleSaveProject = async () => {
    if (!sourceImage || !currentResult) return;
    setIsSavingProject(true);
    const project: Project = {
      id: currentResult.id,
      name: `${settings.style} Layout Study`,
      updatedAt: Date.now(),
      sourceImage: sourceImage,
      settings: settings,
      result: currentResult,
      history: history,
      shoppingItems: currentBatchInfo?.shopping || [],
      budgetItems: currentBatchInfo?.budget || []
    };
    await new Promise(r => setTimeout(r, 600));
    const existingRaw = localStorage.getItem('lumina_projects');
    const existing: Project[] = existingRaw ? JSON.parse(existingRaw) : [];
    existing.push(project);
    localStorage.setItem('lumina_projects', JSON.stringify(existing));
    setIsSavingProject(false);
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 3000);
  };

  const handleDownload = () => {
    if (currentResult) {
      const link = document.createElement('a');
      link.href = currentResult.imageUrl;
      link.download = `lumina-redesign-${activeLayoutIndex+1}.png`;
      link.click();
    }
  };

  const handleView3D = async () => {
      if (!currentResult) return;
      if (currentResult.depthMapUrl) {
          setShow3DViewer(true);
          return;
      }
      setIsGeneratingDepth(true);
      try {
          const depthMap = await generateDepthMap(currentResult.imageUrl);
          setResultBatch(prev => {
              const next = [...prev];
              next[activeLayoutIndex] = { ...next[activeLayoutIndex], depthMapUrl: depthMap };
              return next;
          });
          setShow3DViewer(true);
      } catch (e) {
          setErrorMsg("Failed to generate 3D view");
      } finally {
          setIsGeneratingDepth(false);
      }
  };

  const handleSavePreset = (name: string) => {
    if (!user) return;
    const newPreset: SavedPreset = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      roomType: settings.roomType,
      style: settings.style,
      lighting: settings.lighting,
      creativity: settings.creativity,
      prompt: settings.prompt,
      dimensions: settings.dimensions as any
    };
    handleUpdateProfile({
      ...user,
      preferences: {
        ...user.preferences,
        savedPresets: [...user.preferences.savedPresets, newPreset]
      }
    });
  };

  const handleLoadPreset = (preset: SavedPreset) => {
    setSettings({
      ...settings,
      roomType: preset.roomType,
      style: preset.style,
      lighting: preset.lighting,
      creativity: preset.creativity,
      prompt: preset.prompt,
      dimensions: preset.dimensions as any
    });
  };

  return (
    <>
      {showWelcome && <WelcomeScreen onComplete={() => setShowWelcome(false)} />}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={handleLogin} />}
      {showSettings && user && <SettingsModal user={user} onClose={() => setShowSettings(false)} onUpdate={handleUpdateProfile} />}
      
      <div className={`min-h-screen font-sans text-accent pb-12 lg:pb-20 relative overflow-x-hidden transition-opacity duration-1000 ${showWelcome ? 'opacity-0' : 'opacity-100'}`}>
        
        <div className="fixed inset-0 -z-10 bg-background overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-tertiary/20 rounded-full blur-[120px] animate-blob mix-blend-screen" />
          <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-primary/20 rounded-full blur-[100px] animate-blob mix-blend-screen" style={{animationDelay: '2s'}} />
        </div>

        {show3DViewer && currentResult && currentResult.depthMapUrl && (
            <ThreeDViewer imageUrl={currentResult.imageUrl} depthUrl={currentResult.depthMapUrl} onClose={() => setShow3DViewer(false)} />
        )}

        <header className="sticky top-0 z-50 glass-panel border-b border-white/5 h-20 lg:h-24">
          <div className="max-w-[1700px] mx-auto px-4 lg:px-10 h-full flex items-center justify-between">
            <div className="flex items-center gap-5 cursor-pointer group" onClick={() => window.location.reload()}>
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-2xl">
                <Sparkles size={20} className="text-white" />
              </div>
              <div className="hidden sm:block">
                <span className="text-xl lg:text-3xl font-display font-bold tracking-tighter text-white block leading-none">Lumina</span>
                <span className="text-[8px] lg:text-[10px] uppercase tracking-[0.4em] text-secondary font-black mt-1 block">Studio Suite</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
               {(appState === AppState.EDITOR || appState === AppState.RESULTS) && (
                  <button onClick={handleSaveProject} disabled={isSavingProject} className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${showSaveSuccess ? 'bg-secondary/20 border-secondary text-secondary' : 'bg-white/5 border-white/5 text-accent/50 hover:text-white hover:bg-white/10'}`}>
                    {isGenerating ? <div className="w-4 h-4 border-2 border-accent/20 border-t-accent rounded-full animate-spin" /> : showSaveSuccess ? <CheckCircle2 size={16} /> : <Save size={16} />}
                    {showSaveSuccess ? 'Synced' : 'Sync Project'}
                  </button>
               )}
               {user ? (
                 <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl border-2 border-secondary/40 overflow-hidden">
                    <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                 </button>
               ) : (
                 <button onClick={() => setShowLogin(true)} className="px-6 py-3 rounded-2xl bg-pale text-background text-[10px] font-black uppercase tracking-[0.3em] hover:bg-secondary hover:text-white transition-all">Portal</button>
               )}
            </div>
          </div>
        </header>

        <main className="max-w-[1700px] mx-auto px-4 lg:px-10 py-8 lg:py-16">
          {appState === AppState.UPLOAD && (
            <div className="max-w-5xl mx-auto mt-8 lg:mt-24 text-center">
              <h1 className="text-5xl lg:text-[9rem] font-display font-bold mb-12 tracking-tighter leading-[0.8] text-transparent bg-clip-text bg-gradient-to-b from-white via-accent to-accent/20">Redesign <br /> Reality</h1>
              <div className="glass-panel p-4 rounded-[4rem] border-white/10"><UploadZone onImageSelected={handleImageSelected} /></div>
              {history.length > 0 && <div className="mt-28 text-left"><HistoryPanel history={history} activeResultId={currentResult?.id || ""} onSelectResult={handleRestoreHistory} /></div>}
            </div>
          )}

          {(appState === AppState.EDITOR || appState === AppState.GENERATING) && sourceImage && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-20 animate-fade-in items-start">
              <div className="lg:col-span-8 flex flex-col gap-14">
                <div className="glass-panel rounded-[4rem] overflow-hidden relative border-white/10 flex items-center justify-center min-h-[500px]">
                   <MaskCanvas key={sourceImage} ref={maskCanvasRef} imageSrc={sourceImage} onMaskChange={setHasMask} previewBox={previewBox} />
                   {isGenerating && (
                     <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center">
                        <div className="animate-spin rounded-full h-40 w-40 border-t-2 border-b-2 border-secondary mb-12 shadow-[0_0_70px_rgba(170,196,140,0.5)]" />
                        <p className="text-4xl font-display font-bold text-white animate-pulse mb-2">{orchestratedInstruction}</p>
                        <span className="text-[10px] uppercase text-secondary font-black tracking-[0.5em] opacity-60">Synchronizing Spatial Matrix</span>
                     </div>
                   )}
                </div>
              </div>
              <div className="lg:col-span-4 sticky top-36">
                 <div className="glass-panel p-12 rounded-[4rem] border border-white/10 shadow-2xl">
                    <ControlPanel settings={settings} onChange={setSettings} isGenerating={isGenerating} onGenerate={handleGenerate} isValid={!!sourceImage} suggestions={suggestions} isAnalyzing={isAnalyzing} onApplySuggestion={handleApplySuggestion} onPreviewSuggestion={setPreviewBox} user={user} onSavePreset={handleSavePreset} onLoadPreset={handleLoadPreset} />
                 </div>
              </div>
            </div>
          )}

          {appState === AppState.RESULTS && currentResult && (
             <div className="max-w-[1600px] mx-auto animate-fade-in">
                
                {/* Unified Layout Switcher */}
                <div className="flex flex-col items-center gap-6 mb-12">
                    <div className="inline-flex items-center gap-1 p-1.5 bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-2xl">
                        {resultBatch.map((res, idx) => (
                            <button
                                key={res.id}
                                onClick={() => setActiveLayoutIndex(idx)}
                                className={`flex items-center gap-3 px-10 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 ${activeLayoutIndex === idx ? 'bg-secondary text-background shadow-xl' : 'text-accent/40 hover:text-white'}`}
                            >
                                <LayoutIcon size={14} /> Layout 0{idx + 1}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6 mb-12">
                   <button onClick={() => setAppState(AppState.EDITOR)} className="group flex items-center gap-4 pl-8 pr-10 py-5 rounded-[2rem] bg-white/5 border border-white/10 text-white font-black uppercase tracking-[0.2em] text-xs hover:bg-white/10">
                     <ArrowLeft size={16} /> Adjust Source
                   </button>
                   
                   <div className="flex flex-wrap gap-4">
                      {settings.dimensions && (
                        <div className="px-8 py-5 rounded-[2rem] bg-secondary/10 border border-secondary/30 flex items-center gap-3">
                           <Ruler size={16} className="text-secondary" />
                           <span className="text-[10px] font-black uppercase tracking-widest text-secondary">
                              Architectural Lock: {settings.dimensions.length || '?'}m x {settings.dimensions.width || '?'}m
                           </span>
                        </div>
                      )}
                      <button onClick={handleChainDesign} className="px-12 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-4 bg-gradient-to-r from-secondary to-primary text-background shadow-lg hover:scale-105 transition-all">
                         <Wand2 size={18} /> Re-edit Layout
                      </button>
                      <button onClick={handleDownload} className="px-12 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-4 bg-white text-black hover:bg-secondary hover:text-white transition-all shadow-xl">
                        <Download size={18} /> Save Asset
                      </button>
                      <div className="flex bg-white/5 border border-white/10 rounded-[2rem] p-1 shadow-lg backdrop-blur-md">
                        <button onClick={() => setShowProductPins(!showProductPins)} className={`px-8 py-4 rounded-[1.8rem] font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-3 transition-all ${showProductPins ? 'bg-secondary text-background shadow-xl' : 'text-accent/50 hover:text-white'}`}>
                          <Search size={14} /> Hotspot Pins
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleView3D} disabled={isGeneratingDepth} className="bg-white/5 text-white px-10 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-4 hover:bg-white/10 border border-white/10">
                          {isGeneratingDepth ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"/> : <Box size={18} />} 3D View
                        </button>
                      </div>
                   </div>
                </div>

                <div className="glass-panel rounded-[4rem] overflow-hidden shadow-2xl border-white/10 mb-12 relative group flex justify-center items-center bg-black/20">
                   <div className="relative w-full h-full flex items-center justify-center">
                     <ImageSlider key={currentResult.id} beforeImage={sourceImage || ""} afterImage={currentResult.imageUrl}>
                        <ProductVisualDiscovery 
                            products={currentBatchInfo?.shopping || []} 
                            isVisible={showProductPins} 
                        />
                     </ImageSlider>
                   </div>
                   <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                      <div className="bg-secondary/90 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 shadow-2xl border border-white/20">
                         <Check size={14} className="text-background" />
                         <span className="text-[10px] font-black uppercase tracking-widest text-background">Architectural Ground Truth Preserved</span>
                      </div>
                   </div>
                </div>
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-14">
                  <ShoppingPanel items={currentBatchInfo?.shopping || []} isLoading={isBatchDataLoading} />
                  <BudgetPanel currentItems={currentBatchInfo?.budget || []} history={[]} isLoading={isBatchDataLoading} />
                </div>
             </div>
          )}
        </main>
      </div>
    </>
  );
}
