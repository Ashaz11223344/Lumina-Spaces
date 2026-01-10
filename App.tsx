
import React, { useState, useEffect, useRef } from 'react';
import { AppState, GenerationSettings, StylePreset, LightingOption, GenerationResult, DesignSuggestion, ProductItem, BudgetItem, RoomType, UserProfile, SavedPreset } from './types';
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
import { orchestrateDesign, generateRoomImage, detectRoomImprovements, analyzeShoppableItems, estimateRenovationCost, generateDepthMap } from './services/geminiService';
import { ArrowLeft, Download, Info, Sparkles, Layers, PenTool, Box, User, LogOut, CloudCheck, Settings as SettingsIcon, ChevronDown } from 'lucide-react';

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
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Persistence logic: Load from localStorage on mount
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
        console.warn("Session restore failed, clearing stale data.");
        localStorage.removeItem('lumina_current_user');
      }
    }

    // Handle clicks outside user menu
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Watch for autoSuggest toggle
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
    
    // Sync to main "database"
    const dbUsersStr = localStorage.getItem('lumina_db_users');
    if (dbUsersStr) {
      try {
        const dbUsers = JSON.parse(dbUsersStr);
        const index = dbUsers.findIndex((u: any) => u.id === updatedUser.id);
        if (index !== -1) {
          dbUsers[index] = { ...dbUsers[index], ...updatedUser };
          localStorage.setItem('lumina_db_users', JSON.stringify(dbUsers));
        }
      } catch (e) { console.error("Database sync failed", e); }
    }
  };

  const handleLogin = (newUser: UserProfile) => {
    setUser(newUser);
    applyUserPreferences(newUser);
    setShowLogin(false);
    localStorage.setItem('lumina_current_user', JSON.stringify(newUser));
    
    // Load design data for this user
    const savedHistory = localStorage.getItem(`lumina_history_${newUser.id}`);
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    else setHistory([]);

    const savedBudgets = localStorage.getItem(`lumina_budgets_${newUser.id}`);
    if (savedBudgets) setBudgetHistory(JSON.parse(savedBudgets));
    else setBudgetHistory([]);
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
      setResult(null);
      setIsSigningOut(false);
    }, 400); 
  };

  // Save design data when user or history changes
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
        setBudgetItems([]);
        setShoppingItems([]);
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
      setAppState(AppState.RESULTS);
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
      if (window.confirm("Start a new project? Architecture history is synced to your cloud profile.")) {
          setAppState(AppState.UPLOAD);
          setSourceImage(null);
          setResult(null);
          setHasMask(false);
          setSuggestions([]);
          setShoppingItems([]);
          setBudgetItems([]);
          setPreviewBox(null);
          if (user) applyUserPreferences(user);
          else {
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

  const handleSavePreset = (name: string) => {
    if (!user) return;
    const newPreset: SavedPreset = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      roomType: settings.roomType,
      style: settings.style,
      lighting: settings.lighting,
      creativity: settings.creativity,
      prompt: settings.prompt
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
    setSettings(prev => ({
      ...prev,
      roomType: preset.roomType,
      style: preset.style,
      lighting: preset.lighting,
      creativity: preset.creativity,
      prompt: preset.prompt
    }));
  };

  const currentBudgetRound = budgetHistory.length > 0 ? budgetHistory[budgetHistory.length - 1].items : [];
  const pastBudgetHistory = budgetHistory.length > 1 ? budgetHistory.slice(0, budgetHistory.length - 1) : [];

  return (
    <>
      {showWelcome && <WelcomeScreen onComplete={() => setShowWelcome(false)} />}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={handleLogin} />}
      {showSettings && user && (
        <SettingsModal 
          user={user} 
          onClose={() => setShowSettings(false)} 
          onUpdate={handleUpdateProfile} 
        />
      )}
      
      <div className={`min-h-screen font-sans text-accent pb-20 relative overflow-x-hidden selection:bg-primary/30 selection:text-white transition-opacity duration-1000 ${showWelcome ? 'opacity-0' : 'opacity-100'}`}>
        
        <div className="fixed inset-0 -z-10 bg-background overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-tertiary/20 rounded-full blur-[120px] animate-blob mix-blend-screen" />
          <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-primary/20 rounded-full blur-[100px] animate-blob mix-blend-screen" style={{animationDelay: '2s'}} />
          <div className="absolute bottom-[-10%] left-[20%] w-[45vw] h-[45vw] bg-secondary/10 rounded-full blur-[100px] animate-blob mix-blend-screen" style={{animationDelay: '4s'}} />
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 brightness-150 contrast-120 mix-blend-overlay"></div>
        </div>

        {show3DViewer && result && result.depthMapUrl && (
            <ThreeDViewer 
               imageUrl={result.imageUrl}
               depthUrl={result.depthMapUrl}
               onClose={() => setShow3DViewer(false)}
            />
        )}

        <header className="sticky top-0 z-50 glass-panel border-b border-white/5 h-24">
          <div className="max-w-[1700px] mx-auto px-10 h-full flex items-center justify-between">
            <div className="flex items-center gap-5 cursor-pointer group" onClick={() => window.location.reload()}>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-2xl shadow-primary/30 group-hover:rotate-12 transition-transform duration-500">
                <Sparkles size={24} className="text-white fill-white/20" />
              </div>
              <div>
                <span className="text-3xl font-display font-bold tracking-tighter text-white block leading-none">Lumina</span>
                <span className="text-[10px] uppercase tracking-[0.4em] text-secondary font-black mt-1.5 block">Studio Suite</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
               {appState !== AppState.UPLOAD && (
                  <button 
                    type="button" 
                    onClick={handleStartOver}
                    disabled={isGenerating}
                    className="hidden lg:flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-accent/50 hover:text-white hover:bg-white/5 border border-white/5 hover:border-white/10 transition-all disabled:opacity-50"
                  >
                    New Session
                  </button>
               )}

               <div className="h-10 w-px bg-white/10 hidden sm:block" />

               {user ? (
                 <div className="relative" ref={userMenuRef}>
                    <button 
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className={`flex items-center gap-4 pl-2 pr-5 py-2 rounded-2xl transition-all ${isUserMenuOpen ? 'bg-white/10 border-white/20' : 'bg-transparent border-transparent'} border`}
                    >
                       <img src={user.avatar} alt="Avatar" className="w-12 h-12 rounded-2xl border-2 border-secondary/40 shadow-2xl" />
                       <div className="hidden md:flex flex-col items-start">
                          <span className="text-sm font-bold text-white leading-none flex items-center gap-1.5">
                             {user.name}
                             <CloudCheck size={14} className="text-tertiary" />
                          </span>
                          <span className="text-[9px] text-accent/40 font-black uppercase tracking-widest mt-1.5">Lead Architect</span>
                       </div>
                       <ChevronDown size={14} className={`text-slate-500 transition-transform duration-500 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <div 
                      className={`absolute top-full right-0 mt-4 w-72 glass-panel p-4 rounded-[2.5rem] border border-white/10 shadow-2xl transition-all duration-400 origin-top-right z-[100] 
                        ${isUserMenuOpen && !isSigningOut ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-90 pointer-events-none'}`}
                    >
                        <div className="p-4 mb-3 bg-white/5 rounded-2xl border border-white/5">
                           <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">Studio ID</p>
                           <p className="text-xs font-bold text-white truncate opacity-70">{user.email}</p>
                        </div>
                        <button 
                          onClick={() => { setIsUserMenuOpen(false); setShowSettings(true); }}
                          className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-all group"
                        >
                           <div className="p-2.5 rounded-xl bg-white/5 group-hover:bg-primary/20 transition-colors">
                             <SettingsIcon size={18} />
                           </div>
                           Studio Settings
                        </button>
                        <div className="h-px bg-white/5 my-3 mx-4" />
                        <button 
                          onClick={handleLogout} 
                          className={`w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-red-500/10 text-sm text-red-400 hover:text-red-300 transition-all group ${isSigningOut ? 'animate-pulse' : ''}`}
                        >
                           <div className="p-2.5 rounded-xl bg-white/5 group-hover:bg-red-500/20 transition-colors">
                             <LogOut size={18} />
                           </div>
                           Sign Out Studio
                        </button>
                    </div>
                 </div>
               ) : (
                 <button 
                   onClick={() => setShowLogin(true)}
                   className="flex items-center gap-4 px-10 py-4 rounded-2xl bg-pale text-background text-[10px] font-black uppercase tracking-[0.3em] hover:bg-secondary hover:text-white transition-all group shadow-2xl shadow-white/5"
                 >
                   <User size={18} className="transition-transform group-hover:scale-110" />
                   Studio Portal
                 </button>
               )}
            </div>
          </div>
        </header>

        <main className="max-w-[1700px] mx-auto px-10 py-16">
          {errorMsg && (
            <div className="mb-12 p-6 bg-red-900/20 backdrop-blur-2xl border border-red-500/30 text-red-200 rounded-[2.5rem] flex items-center gap-5 shadow-2xl animate-fade-in max-w-2xl mx-auto">
               <div className="p-3.5 bg-red-500/20 rounded-2xl text-red-400"><Info size={28} /></div>
               <div>
                  <h4 className="font-black text-white uppercase text-[10px] tracking-widest mb-1">Architectural Alert</h4>
                  <p className="text-sm opacity-80 leading-relaxed">{errorMsg}</p>
               </div>
            </div>
          )}

          {appState === AppState.UPLOAD && (
            <div className="max-w-5xl mx-auto mt-12 md:mt-24 animate-fade-in text-center relative">
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-40 w-[600px] h-[600px] bg-primary/20 blur-[180px] rounded-full pointer-events-none" />
               <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-secondary uppercase tracking-[0.4em] mb-12 backdrop-blur-md">
                <div className="w-2.5 h-2.5 rounded-full bg-tertiary animate-pulse shadow-lg shadow-tertiary/50" />
                Visionary Core Online
              </div>
              <h1 className="text-7xl md:text-[9rem] font-display font-bold mb-12 tracking-tighter leading-[0.8] text-transparent bg-clip-text bg-gradient-to-b from-accent via-accent to-accent/20 drop-shadow-2xl">
                Redesign <br className="hidden md:block" /> Reality
              </h1>
              <p className="text-accent/60 mb-20 text-xl md:text-3xl max-w-3xl mx-auto leading-relaxed font-light">
                {user ? (
                  <>Welcome back, <span className="text-white font-bold">{user.name.split(' ')[0]}</span>. Your architectural suite is synchronized.</>
                ) : "Transform your spatial environment with high-fidelity vision orchestration."}
              </p>
              <div className="glass-panel p-4 rounded-[4rem] shadow-[0_0_100px_-20px_rgba(170,196,140,0.4)] border-white/10">
                 <UploadZone onImageSelected={handleImageSelected} />
              </div>

              {history.length > 0 && (
                <div className="mt-28 text-left">
                    <HistoryPanel history={history} activeResultId={result?.id || ""} onSelectResult={handleRestoreHistory} />
                </div>
              )}
            </div>
          )}

          {(appState === AppState.EDITOR || appState === AppState.GENERATING) && sourceImage && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-20 animate-fade-in">
              <div className="lg:col-span-8 flex flex-col gap-14">
                <div className="glass-panel rounded-[4rem] shadow-2xl overflow-hidden relative group border-white/10">
                   <div className="p-3">
                     <MaskCanvas 
                        key={sourceImage}
                        ref={maskCanvasRef} 
                        imageSrc={sourceImage} 
                        onMaskChange={setHasMask} 
                        previewBox={previewBox} 
                      />
                   </div>
                   {isGenerating && (
                     <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-3xl flex flex-col items-center justify-center">
                        <div className="relative mb-12">
                          <div className="animate-spin rounded-full h-40 w-40 border-t-2 border-b-2 border-secondary shadow-[0_0_70px_rgba(170,196,140,0.5)]"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles size={48} className="text-secondary animate-pulse" />
                          </div>
                        </div>
                        <p className="text-4xl font-display font-bold text-white animate-pulse tracking-tight mb-3">
                          {orchestratedInstruction ? "Synthesizing Space..." : "Orchestrating Architecture..."}
                        </p>
                        <span className="text-[10px] uppercase text-secondary font-black tracking-[0.5em] opacity-60">Synchronizing design matrix</span>
                     </div>
                   )}
                </div>
                <div className="flex items-center gap-8 p-10 bg-primary/10 backdrop-blur rounded-[3rem] border border-white/5 shadow-2xl">
                  <div className="w-16 h-16 rounded-[1.5rem] bg-white/5 flex items-center justify-center text-secondary flex-shrink-0 border border-white/10 shadow-xl"><Info size={32} /></div>
                  <div className="text-lg text-accent/80">
                    <span className="block font-black text-white uppercase tracking-[0.3em] text-xs mb-3">Inpainting Engine Active</span>
                    Define the object volume roughly. The AI identifies edges and calculates visual weight for a perfect organic merge.
                  </div>
                </div>
              </div>
              <div className="lg:col-span-4">
                 <div className="glass-panel p-10 md:p-12 rounded-[4rem] sticky top-36 border border-white/10 shadow-2xl">
                    <ControlPanel 
                      settings={settings} 
                      onChange={setSettings} 
                      isGenerating={isGenerating} 
                      onGenerate={handleGenerate} 
                      isValid={!!sourceImage} 
                      suggestions={suggestions} 
                      isAnalyzing={isAnalyzing} 
                      onApplySuggestion={handleApplySuggestion} 
                      onPreviewSuggestion={setPreviewBox} 
                      user={user}
                      onSavePreset={handleSavePreset}
                      onLoadPreset={handleLoadPreset}
                    />
                 </div>
              </div>
            </div>
          )}

          {appState === AppState.RESULTS && result && (
             <div className="max-w-[1600px] mx-auto animate-fade-in">
                <div className="flex justify-between items-center mb-12">
                   <button onClick={() => setAppState(AppState.EDITOR)} className="group flex items-center gap-4 pl-8 pr-10 py-5 rounded-[2rem] bg-white/5 border border-white/10 text-white font-black uppercase tracking-[0.2em] text-xs hover:bg-white/10 hover:text-secondary transition-all backdrop-blur-xl">
                     <ArrowLeft size={20} className="group-hover:-translate-x-1.5 transition-transform" />
                     Back to Studio
                   </button>
                   
                   <div className="flex gap-5">
                      <button 
                        onClick={handleView3D}
                        disabled={isGeneratingDepth}
                        className="bg-white/5 text-white px-10 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-4 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50"
                      >
                        {isGeneratingDepth ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"/> : <Box size={24} />}
                        3D Hologram
                      </button>

                      <button onClick={handleDownload} className="hidden md:flex bg-white/5 text-white px-10 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs items-center gap-4 hover:bg-white/10 border border-white/10 transition-all">
                        <Download size={24} />
                        Export
                      </button>
                      <button onClick={handleRefineResult} className="bg-primary hover:bg-secondary text-white px-12 py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-4 shadow-[0_0_60px_rgba(106,122,90,0.5)] transition-all hover:scale-105 active:scale-95">
                        <Layers size={24} />
                        Refine Render
                      </button>
                   </div>
                </div>

                <div className="glass-panel rounded-[5rem] overflow-hidden shadow-2xl border-white/10 mb-20">
                   <div className="grid grid-cols-1 lg:grid-cols-2">
                      <div className="relative group border-b lg:border-b-0 lg:border-r border-white/10 h-[50vh] lg:h-[85vh] overflow-hidden">
                         <div className="absolute top-12 left-12 bg-black/75 backdrop-blur-2xl text-white text-[11px] font-black px-8 py-3 rounded-full z-10 border border-white/10 uppercase tracking-[0.5em]">Origin</div>
                         <img src={sourceImage || ""} alt="Original" className="w-full h-full object-cover opacity-80 transition-transform duration-1200 group-hover:scale-110 group-hover:opacity-100" />
                      </div>
                      <div className="relative group h-[50vh] lg:h-[85vh] overflow-hidden bg-black/80">
                         <div className="absolute top-12 left-12 bg-gradient-to-r from-primary/95 to-secondary/95 backdrop-blur-2xl text-white text-[11px] font-black px-8 py-3 rounded-full z-10 flex items-center gap-4 shadow-2xl border border-white/20 uppercase tracking-[0.5em]">
                            <Sparkles size={16} className="fill-current animate-pulse text-glow" />
                            Final Render
                         </div>
                         <img src={result.imageUrl} alt="Generated" className="w-full h-full object-cover transition-transform duration-1200 group-hover:scale-110" />
                         <div className="absolute bottom-0 left-0 right-0 p-16 lg:p-20 bg-gradient-to-t from-black via-black/95 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-800 flex items-end justify-between translate-y-12 group-hover:translate-y-0">
                            <button onClick={handleRefineResult} className="bg-white text-black px-12 py-6 rounded-[2.5rem] font-black uppercase tracking-[0.3em] text-xs flex items-center gap-4 hover:bg-tertiary hover:text-white shadow-2xl hover:shadow-tertiary/50 active:scale-95 transition-all">
                               <PenTool size={28} />
                               Iterate Vision
                            </button>
                         </div>
                      </div>
                   </div>
                </div>
                
                {history.length > 0 && (
                   <div className="mb-24">
                     <HistoryPanel history={history} activeResultId={result.id} onSelectResult={handleRestoreHistory} />
                   </div>
                )}
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-14">
                  <ShoppingPanel items={shoppingItems} isLoading={isShoppingLoading} />
                  <BudgetPanel currentItems={currentBudgetRound} history={pastBudgetHistory} isLoading={isBudgetLoading} />
                </div>
             </div>
          )}
        </main>
      </div>
    </>
  );
}
