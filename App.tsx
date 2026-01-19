
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
import { ArrowLeft, Download, Info, Sparkles, Layers, PenTool, Box, User, LogOut, CloudCheck, Settings as SettingsIcon, ChevronDown, Save, CheckCircle2, FileUp, FileDown, Search, Menu, X, Plus, Wand2, Check, LayoutGrid, Layout as LayoutIcon, Maximize2 } from 'lucide-react';

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 3x3 Generation Matrix State: [ConceptIndex][LayoutIndex]
  const [resultMatrix, setResultMatrix] = useState<GenerationResult[][]>([]);
  const [activeConceptIndex, setActiveConceptIndex] = useState(0);
  const [activeLayoutIndex, setActiveLayoutIndex] = useState(0);
  const [matrixData, setMatrixData] = useState<{ [key: string]: { shopping: ProductItem[], budget: BudgetItem[] } }>({});

  // Discovery UI State
  const [showProductPins, setShowProductPins] = useState(true);

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
  const [orchestratedInstruction, setOrchestratedInstruction] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 3D View State
  const [show3DViewer, setShow3DViewer] = useState(false);
  const [isGeneratingDepth, setIsGeneratingDepth] = useState(false);

  // Auto Suggestion State
  const [suggestions, setSuggestions] = useState<DesignSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [isMatrixDataLoading, setIsMatrixDataLoading] = useState(false);

  const maskCanvasRef = useRef<MaskCanvasHandle>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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

  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [budgetHistory, setBudgetHistory] = useState<{ id: string, items: BudgetItem[] }[]>([]);

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
      setResultMatrix([]);
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
        setResultMatrix([]);
        setMatrixData({});
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
    setOrchestratedInstruction("Orchestrating 9-Fold Rearrangement Matrix...");
    setResultMatrix([]);
    setMatrixData({});
    setActiveConceptIndex(0);
    setActiveLayoutIndex(0);

    try {
      let maskBase64 = undefined;
      if (hasMask && maskCanvasRef.current) {
        const maskData = maskCanvasRef.current.getMaskData();
        if (maskData) maskBase64 = maskData;
      }

      const concepts = [
        { id: 1, name: "Organic Earth", focus: "natural textures and wood elements" },
        { id: 2, name: "Luxury High-Light", focus: "sophisticated integrated lighting and metallics" },
        { id: 3, name: "Harmonious Flow", focus: "minimalist spatial balance and soft acoustics" }
      ];

      const layouts = [
        { id: 'A', name: "Optimized Classic", spatial: "optimizing the original orientation for better circulation" },
        { id: 'B', name: "Rotated Focal", spatial: "rotating the focal point by 90 degrees to create a new perspective" },
        { id: 'C', name: "Social Cluster", spatial: "rearranging furniture into a conversational cluster for hosting" }
      ];

      const matrixResults: GenerationResult[][] = [[], [], []];

      // We generate 3 concepts, each with 3 layouts = 9 outputs
      for (let cIdx = 0; cIdx < concepts.length; cIdx++) {
        setOrchestratedInstruction(`Synthesizing Concept 0${cIdx+1}...`);
        
        const conceptResults = await Promise.all(layouts.map(async (l, lIdx) => {
          const promptForLayout = await orchestrateDesign(
            { ...settings, prompt: `${settings.prompt}. CONCEPT: ${concepts[cIdx].focus}. LAYOUT VARIATION: ${l.spatial}.` }, 
            sourceImage, 
            maskBase64
          );
          
          const img = await generateRoomImage(sourceImage, promptForLayout, maskBase64);
          
          const res: GenerationResult = {
            id: `matrix-${Date.now()}-${cIdx}-${lIdx}`,
            imageUrl: img,
            promptUsed: promptForLayout,
            timestamp: Date.now(),
            sourceImage: sourceImage,
            settings: { ...settings }
          };
          return res;
        }));

        matrixResults[cIdx] = conceptResults;
      }

      setResultMatrix(matrixResults);
      const flattened = matrixResults.flat();
      setHistory(prev => [...flattened, ...prev]);
      setAppState(AppState.RESULTS);

      // Data enrichment for the 9-fold batch
      setIsMatrixDataLoading(true);
      const enrichmentPromises = flattened.map(async (res) => {
        const [shopping, budget] = await Promise.all([
            analyzeShoppableItems(res.imageUrl, maskBase64),
            estimateRenovationCost(res.imageUrl, maskBase64, settings.roomType)
        ]);
        return { id: res.id, shopping, budget };
      });

      const enriched = await Promise.all(enrichmentPromises);
      const newMatrixData: typeof matrixData = {};
      enriched.forEach(e => {
        newMatrixData[e.id] = { shopping: e.shopping, budget: e.budget };
      });
      
      setMatrixData(newMatrixData);
      setBudgetHistory(prev => [
          ...prev, 
          ...enriched.map(e => ({ id: e.id, items: e.budget }))
      ]);
      setIsMatrixDataLoading(false);

    } catch (e: any) {
      setErrorMsg(e.message || "An error occurred during matrix generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const currentResult = resultMatrix[activeConceptIndex]?.[activeLayoutIndex];
  const currentMatrixInfo = currentResult ? matrixData[currentResult.id] : null;

  const handleRestoreHistory = (historyItem: GenerationResult) => {
      setResultMatrix([[historyItem]]);
      setActiveConceptIndex(0);
      setActiveLayoutIndex(0);
      setSourceImage(historyItem.sourceImage);
      setSettings(historyItem.settings);
      setAppState(AppState.RESULTS);
      setPreviewBox(null);
  };

  const handleChainDesign = () => {
    if (currentResult) {
        setSourceImage(currentResult.imageUrl);
        setAppState(AppState.EDITOR);
        setHasMask(false);
        setResultMatrix([]);
        setMatrixData({});
        setOrchestratedInstruction("");
        setSettings(prev => ({ ...prev, prompt: '' }));
    }
  };

  const handleSaveProject = async () => {
    if (!sourceImage || !currentResult) return;
    setIsSavingProject(true);
    const project: Project = {
      id: currentResult.id,
      name: `${settings.style} Redesign Matrix`,
      userId: user?.id,
      updatedAt: Date.now(),
      sourceImage: sourceImage,
      settings: settings,
      result: currentResult,
      history: history,
      shoppingItems: currentMatrixInfo?.shopping || [],
      budgetItems: currentMatrixInfo?.budget || []
    };
    await new Promise(r => setTimeout(r, 800));
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
      link.download = `lumina-concept-${activeConceptIndex+1}-layout-${activeLayoutIndex+1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
          setResultMatrix(prev => {
              const next = [...prev];
              next[activeConceptIndex][activeLayoutIndex] = { ...next[activeConceptIndex][activeLayoutIndex], depthMapUrl: depthMap };
              return next;
          });
          setShow3DViewer(true);
      } catch (e) {
          setErrorMsg("Failed to generate 3D view");
      } finally {
          setIsGeneratingDepth(false);
      }
  };

  // Fix: Added handleSavePreset to resolve missing reference error in App component
  const handleSavePreset = (name: string) => {
    if (!user) return;
    const newPreset: SavedPreset = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      roomType: settings.roomType,
      style: settings.style,
      lighting: settings.lighting,
      creativity: settings.creativity,
      prompt: settings.prompt
    };
    const updatedUser: UserProfile = {
      ...user,
      preferences: {
        ...user.preferences,
        savedPresets: [...user.preferences.savedPresets, newPreset]
      }
    };
    handleUpdateProfile(updatedUser);
  };

  // Fix: Added handleLoadPreset to resolve missing reference error in App component
  const handleLoadPreset = (preset: SavedPreset) => {
    setSettings({
      ...settings,
      roomType: preset.roomType,
      style: preset.style,
      lighting: preset.lighting,
      creativity: preset.creativity,
      prompt: preset.prompt
    });
  };

  // Fix: Implemented handleImportTemplate inside component to manage state during file ingestion
  const handleImportTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = JSON.parse(event.target?.result as string) as Project;
        setSourceImage(project.sourceImage);
        setSettings(project.settings);
        if (project.result) {
          setResultMatrix([[project.result]]);
          setActiveConceptIndex(0);
          setActiveLayoutIndex(0);
          setAppState(AppState.RESULTS);
        } else {
          setAppState(AppState.EDITOR);
        }
      } catch (err) {
        setErrorMsg("Failed to import project template.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      {showWelcome && <WelcomeScreen onComplete={() => setShowWelcome(false)} />}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={handleLogin} />}
      {showSettings && user && <SettingsModal user={user} onClose={() => setShowSettings(false)} onUpdate={handleUpdateProfile} />}
      
      <input ref={importInputRef} type="file" accept=".json" onChange={handleImportTemplate} className="hidden" />

      <div className={`min-h-screen font-sans text-accent pb-12 lg:pb-20 relative overflow-x-hidden transition-opacity duration-1000 ${showWelcome ? 'opacity-0' : 'opacity-100'}`}>
        
        <div className="fixed inset-0 -z-10 bg-background overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-tertiary/20 rounded-full blur-[120px] animate-blob mix-blend-screen" />
          <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-primary/20 rounded-full blur-[100px] animate-blob mix-blend-screen" style={{animationDelay: '2s'}} />
          <div className="absolute bottom-[-10%] left-[20%] w-[45vw] h-[45vw] bg-secondary/10 rounded-full blur-[100px] animate-blob mix-blend-screen" style={{animationDelay: '4s'}} />
        </div>

        {show3DViewer && currentResult && currentResult.depthMapUrl && (
            <ThreeDViewer imageUrl={currentResult.imageUrl} depthUrl={currentResult.depthMapUrl} onClose={() => setShow3DViewer(false)} />
        )}

        <header className="sticky top-0 z-50 glass-panel border-b border-white/5 h-20 lg:h-24">
          <div className="max-w-[1700px] mx-auto px-4 lg:px-10 h-full flex items-center justify-between">
            <div className="flex items-center gap-3 lg:gap-5 cursor-pointer group" onClick={() => window.location.reload()}>
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-2xl shadow-primary/30 group-hover:rotate-12 transition-transform duration-500">
                <Sparkles size={20} className="text-white lg:w-6 lg:h-6" />
              </div>
              <div className="hidden sm:block">
                <span className="text-xl lg:text-3xl font-display font-bold tracking-tighter text-white block leading-none">Lumina</span>
                <span className="text-[8px] lg:text-[10px] uppercase tracking-[0.4em] text-secondary font-black mt-1 block">Studio Suite</span>
              </div>
            </div>

            <div className="flex items-center gap-3 lg:gap-6">
               {(appState === AppState.EDITOR || appState === AppState.RESULTS) && (
                  <button onClick={handleSaveProject} disabled={isSavingProject} className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${showSaveSuccess ? 'bg-secondary/20 border-secondary text-secondary' : 'bg-white/5 border-white/5 text-accent/50 hover:text-white hover:bg-white/10'}`}>
                    {isSavingProject ? <div className="w-4 h-4 border-2 border-accent/20 border-t-accent rounded-full animate-spin" /> : showSaveSuccess ? <CheckCircle2 size={16} /> : <Save size={16} />}
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
                        <span className="text-[10px] uppercase text-secondary font-black tracking-[0.5em] opacity-60">Synchronizing 9-concept matrix</span>
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
                
                {/* 9-Fold Matrix Switcher */}
                <div className="flex flex-col items-center gap-6 mb-12">
                    {/* Primary Level: Concepts */}
                    <div className="inline-flex items-center gap-1 p-1.5 bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10">
                        {[1, 2, 3].map((num, idx) => (
                            <button
                                key={`c-${idx}`}
                                onClick={() => setActiveConceptIndex(idx)}
                                className={`flex items-center gap-3 px-8 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 ${activeConceptIndex === idx ? 'bg-secondary text-background' : 'text-accent/40 hover:text-white'}`}
                            >
                                <LayoutGrid size={14} /> Concept 0{num}
                            </button>
                        ))}
                    </div>

                    {/* Secondary Level: Layouts per Concept */}
                    <div className="inline-flex items-center gap-1 p-1 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10">
                        {['A', 'B', 'C'].map((label, idx) => (
                            <button
                                key={`l-${idx}`}
                                onClick={() => setActiveLayoutIndex(idx)}
                                className={`flex items-center gap-2 px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${activeLayoutIndex === idx ? 'bg-primary text-white shadow-lg' : 'text-accent/30 hover:text-white'}`}
                            >
                                <LayoutIcon size={12} /> Layout {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6 mb-12">
                   <button onClick={() => setAppState(AppState.EDITOR)} className="group flex items-center gap-4 pl-8 pr-10 py-5 rounded-[2rem] bg-white/5 border border-white/10 text-white font-black uppercase tracking-[0.2em] text-xs hover:bg-white/10">
                     <ArrowLeft size={16} /> Adjust Original
                   </button>
                   
                   <div className="flex flex-wrap gap-4">
                      <button onClick={handleChainDesign} className="px-12 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-4 bg-gradient-to-r from-secondary to-primary text-background group shadow-lg shadow-secondary/20">
                         <Wand2 size={18} /> Re-edit this Layout
                      </button>
                      <button onClick={handleDownload} className="px-12 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-4 bg-white text-black hover:bg-secondary hover:text-white transition-all">
                        <Download size={18} /> Output Result
                      </button>
                      <button onClick={() => setShowProductPins(!showProductPins)} className={`px-10 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-4 border transition-all ${showProductPins ? 'bg-secondary/10 text-secondary border-secondary/50' : 'bg-white/5 text-white border-white/10'}`}>
                        <Search size={18} /> Pins {showProductPins ? 'ON' : 'OFF'}
                      </button>
                      <button onClick={handleView3D} disabled={isGeneratingDepth} className="bg-white/5 text-white px-10 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-4 hover:bg-white/10 border border-white/10">
                        {isGeneratingDepth ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"/> : <Box size={18} />} 3D View
                      </button>
                   </div>
                </div>

                <div className="glass-panel rounded-[4rem] overflow-hidden shadow-2xl border-white/10 mb-12 relative group flex justify-center items-center bg-black/20">
                   <div className="relative w-full h-full flex items-center justify-center">
                     <ImageSlider key={currentResult.id} beforeImage={sourceImage || ""} afterImage={currentResult.imageUrl} beforeLabel="Origin" afterLabel={`Concept 0${activeConceptIndex+1} / Layout ${['A','B','C'][activeLayoutIndex]}`} />
                     <ProductVisualDiscovery products={currentMatrixInfo?.shopping || []} isVisible={showProductPins} />
                   </div>
                   <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                      <div className="bg-secondary/90 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 shadow-2xl border border-white/20">
                         <Check size={14} className="text-background" />
                         <span className="text-[10px] font-black uppercase tracking-widest text-background">Architecture Preserved</span>
                      </div>
                   </div>
                </div>
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-14">
                  <ShoppingPanel items={currentMatrixInfo?.shopping || []} isLoading={isMatrixDataLoading} />
                  <BudgetPanel currentItems={currentMatrixInfo?.budget || []} history={[]} isLoading={isMatrixDataLoading} />
                </div>
             </div>
          )}
        </main>
      </div>
    </>
  );
}
