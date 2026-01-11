
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
import { ArrowLeft, Download, Info, Sparkles, Layers, PenTool, Box, User, LogOut, CloudCheck, Settings as SettingsIcon, ChevronDown, Save, CheckCircle2, FileUp, FileDown, Search, Menu, X, Plus } from 'lucide-react';

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
  const importInputRef = useRef<HTMLInputElement>(null);

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
        if (savedHistory) setBudgetHistory(JSON.parse(savedBudgets));
      } catch (e) {
        console.warn("Session restore failed, clearing stale data.");
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

  const handleSaveProject = async () => {
    if (!sourceImage) return;
    setIsSavingProject(true);
    
    const project: Project = {
      id: result?.id || `proj-${Date.now()}`,
      name: `${settings.style} ${settings.roomType} Redesign Redesign`,
      userId: user?.id,
      updatedAt: Date.now(),
      sourceImage: sourceImage,
      settings: settings,
      result: result,
      history: history,
      shoppingItems: shoppingItems,
      budgetItems: budgetItems
    };

    // Simulate network delay for organic feel
    await new Promise(r => setTimeout(r, 1000));

    const existingProjectsRaw = localStorage.getItem('lumina_projects');
    const existingProjects: Project[] = existingProjectsRaw ? JSON.parse(existingProjectsRaw) : [];
    
    const index = existingProjects.findIndex(p => p.id === project.id);
    if (index !== -1) {
      existingProjects[index] = project;
    } else {
      existingProjects.push(project);
    }

    localStorage.setItem('lumina_projects', JSON.stringify(existingProjects));
    
    setIsSavingProject(false);
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 3000);
  };

  const handleExportTemplate = () => {
    if (!sourceImage) return;
    
    const project: Project = {
      id: result?.id || `template-${Date.now()}`,
      name: `${settings.style} ${settings.roomType} Redesign Template Template`,
      userId: user?.id,
      updatedAt: Date.now(),
      sourceImage: sourceImage,
      settings: settings,
      result: result,
      history: history,
      shoppingItems: shoppingItems,
      budgetItems: budgetItems
    };

    const dataStr = JSON.stringify(project, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `lumina-template-${project.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = JSON.parse(event.target?.result as string) as Project;
        
        // Restore State
        setSourceImage(project.sourceImage);
        setSettings(project.settings);
        setHistory(project.history || []);
        setResult(project.result || null);
        setShoppingItems(project.shoppingItems || []);
        setBudgetItems(project.budgetItems || []);
        
        if (project.result) {
          setAppState(AppState.RESULTS);
        } else if (project.sourceImage) {
          setAppState(AppState.EDITOR);
        } else {
          setAppState(AppState.UPLOAD);
        }
        
        // If results exist, also try to rebuild budget history
        if (project.budgetItems.length > 0 && project.result) {
          setBudgetHistory([{ id: project.result.id, items: project.budgetItems }]);
        }

        // Reset input
        if (importInputRef.current) importInputRef.current.value = "";
      } catch (err) {
        console.error("Failed to import template:", err);
        setErrorMsg("Invalid template file format.");
      }
    };
    reader.readAsText(file);
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

  const handleRefineResult = () => {
    setAppState(AppState.EDITOR);
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
      
      {/* Hidden file input for loading templates */}
      <input 
        ref={importInputRef}
        type="file" 
        accept=".json" 
        onChange={handleImportTemplate} 
        className="hidden" 
      />

      <div className={`min-h-screen font-sans text-accent pb-12 lg:pb-20 relative overflow-x-hidden selection:bg-primary/30 selection:text-white transition-opacity duration-1000 ${showWelcome ? 'opacity-0' : 'opacity-100'}`}>
        
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
               <div className="hidden lg:flex items-center gap-3">
                 {(appState === AppState.EDITOR || appState === AppState.RESULTS) && (
                    <>
                      <button 
                        onClick={handleExportTemplate}
                        className="flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border bg-white/5 border-white/5 text-accent/50 hover:text-white hover:bg-white/10"
                        title="Save Template as JSON"
                      >
                        <FileDown size={16} />
                        Save Template
                      </button>

                      <button 
                        onClick={handleSaveProject}
                        disabled={isSavingProject}
                        className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          showSaveSuccess 
                          ? 'bg-secondary/20 border-secondary text-secondary' 
                          : 'bg-white/5 border-white/5 text-accent/50 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {isSavingProject ? (
                          <div className="w-4 h-4 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
                        ) : showSaveSuccess ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <Save size={16} />
                        )}
                        {showSaveSuccess ? 'Project Synced' : 'Sync Project'}
                      </button>
                    </>
                 )}

                 {appState === AppState.UPLOAD && (
                   <button 
                     onClick={() => importInputRef.current?.click()}
                     className="flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border bg-white/5 border-white/5 text-accent/50 hover:text-white hover:bg-white/10"
                   >
                     <FileUp size={16} />
                     Load Template
                   </button>
                 )}
               </div>

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

               <div className="h-10 w-px bg-white/10 hidden lg:block" />

               {user ? (
                 <div className="relative" ref={userMenuRef}>
                    <button 
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className={`flex items-center gap-2 lg:gap-4 pl-1 lg:pl-2 pr-3 lg:pr-5 py-1 lg:py-2 rounded-2xl transition-all ${isUserMenuOpen ? 'bg-white/10 border-white/20' : 'bg-transparent border-transparent'} border`}
                    >
                       <img src={user.avatar} alt="Avatar" className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl border-2 border-secondary/40 shadow-2xl" />
                       <div className="hidden lg:flex flex-col items-start text-left">
                          <span className="text-sm font-bold text-white leading-none flex items-center gap-1.5">
                             {user.name}
                             <CloudCheck size={14} className="text-tertiary" />
                          </span>
                          <span className="text-[9px] text-accent/40 font-black uppercase tracking-widest mt-1.5">Lead Architect</span>
                       </div>
                       <ChevronDown size={14} className={`text-slate-500 transition-transform duration-500 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <div 
                      className={`absolute top-full right-0 mt-4 w-64 lg:w-72 glass-panel p-4 rounded-[2.5rem] border border-white/10 shadow-2xl transition-all duration-400 origin-top-right z-[100] 
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
                        <button 
                          onClick={() => { setIsUserMenuOpen(false); handleStartOver(); }}
                          className="lg:hidden w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-all group"
                        >
                           <div className="p-2.5 rounded-xl bg-white/5 group-hover:bg-secondary/20 transition-colors">
                             <Plus size={18} />
                           </div>
                           New Session
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
                   className="flex items-center gap-3 lg:gap-4 px-6 lg:px-10 py-3 lg:py-4 rounded-2xl bg-pale text-background text-[10px] font-black uppercase tracking-[0.3em] hover:bg-secondary hover:text-white transition-all group shadow-2xl shadow-white/5"
                 >
                   <User size={18} className="transition-transform group-hover:scale-110" />
                   Portal
                 </button>
               )}

               <button 
                 onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                 className="lg:hidden p-3 rounded-2xl bg-white/5 border border-white/10 text-white"
               >
                 {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
               </button>
            </div>
          </div>
          
          {/* Mobile Overlay Menu */}
          {isMobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 top-20 bg-background/95 backdrop-blur-xl z-[40] p-6 animate-fade-in flex flex-col gap-4">
              <button 
                onClick={() => { importInputRef.current?.click(); setIsMobileMenuOpen(false); }}
                className="flex items-center gap-4 p-5 rounded-[2rem] bg-white/5 border border-white/10 text-white text-sm font-bold uppercase tracking-widest"
              >
                <FileUp size={20} className="text-secondary" />
                Load Template
              </button>
              {(appState === AppState.EDITOR || appState === AppState.RESULTS) && (
                <>
                  <button 
                    onClick={() => { handleExportTemplate(); setIsMobileMenuOpen(false); }}
                    className="flex items-center gap-4 p-5 rounded-[2rem] bg-white/5 border border-white/10 text-white text-sm font-bold uppercase tracking-widest"
                  >
                    <FileDown size={20} className="text-secondary" />
                    Save Template
                  </button>
                  <button 
                    onClick={() => { handleSaveProject(); setIsMobileMenuOpen(false); }}
                    className="flex items-center gap-4 p-5 rounded-[2rem] bg-white/5 border border-white/10 text-white text-sm font-bold uppercase tracking-widest"
                  >
                    <Save size={20} className="text-secondary" />
                    Sync Project
                  </button>
                </>
              )}
            </div>
          )}
        </header>

        <main className="max-w-[1700px] mx-auto px-4 lg:px-10 py-8 lg:py-16">
          {errorMsg && (
            <div className="mb-8 lg:mb-12 p-4 lg:p-6 bg-red-900/20 backdrop-blur-2xl border border-red-500/30 text-red-200 rounded-[2rem] lg:rounded-[2.5rem] flex items-center gap-4 lg:gap-5 shadow-2xl animate-fade-in max-w-2xl mx-auto">
               <div className="p-3 bg-red-500/20 rounded-xl text-red-400"><Info size={24} className="lg:w-7 lg:h-7" /></div>
               <div>
                  <h4 className="font-black text-white uppercase text-[9px] lg:text-[10px] tracking-widest mb-0.5 lg:mb-1">Architectural Alert</h4>
                  <p className="text-xs lg:text-sm opacity-80 leading-relaxed">{errorMsg}</p>
                  <button 
                    onClick={() => setErrorMsg(null)}
                    className="text-[8px] lg:text-[9px] uppercase font-bold tracking-widest text-red-300 mt-1 lg:mt-2 hover:text-white underline"
                  >
                    Dismiss
                  </button>
               </div>
            </div>
          )}

          {appState === AppState.UPLOAD && (
            <div className="max-w-5xl mx-auto mt-8 lg:mt-24 animate-fade-in text-center relative">
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-40 w-[300px] lg:w-[600px] h-[300px] lg:h-[600px] bg-primary/20 blur-[100px] lg:blur-[180px] rounded-full pointer-events-none" />
               <div className="inline-flex items-center gap-2 lg:gap-3 px-4 lg:px-6 py-2 lg:py-3 rounded-full bg-white/5 border border-white/10 text-[8px] lg:text-[10px] font-black text-secondary uppercase tracking-[0.3em] lg:tracking-[0.4em] mb-8 lg:mb-12 backdrop-blur-md">
                <div className="w-2 lg:w-2.5 h-2 lg:h-2.5 rounded-full bg-tertiary animate-pulse shadow-lg shadow-tertiary/50" />
                Visionary Core Online
              </div>
              <h1 className="text-5xl lg:text-[9rem] font-display font-bold mb-8 lg:mb-12 tracking-tighter leading-[0.9] lg:leading-[0.8] text-transparent bg-clip-text bg-gradient-to-b from-white via-accent to-accent/20 drop-shadow-2xl px-2">
                Redesign <br className="hidden md:block" /> Reality
              </h1>
              <p className="text-accent/60 mb-12 lg:mb-20 text-lg lg:text-3xl max-w-2xl lg:max-w-3xl mx-auto leading-relaxed font-light px-4">
                {user ? (
                  <>Welcome back, <span className="text-white font-bold">{user.name.split(' ')[0]}</span>. Your architectural suite is synchronized.</>
                ) : "Transform your spatial environment with high-fidelity vision orchestration."}
              </p>
              <div className="glass-panel p-2 lg:p-4 rounded-[3rem] lg:rounded-[4rem] shadow-[0_0_100px_-20px_rgba(170,196,140,0.4)] border-white/10">
                 <UploadZone onImageSelected={handleImageSelected} onLoadTemplate={() => importInputRef.current?.click()} />
              </div>

              {history.length > 0 && (
                <div className="mt-16 lg:mt-28 text-left">
                    <HistoryPanel history={history} activeResultId={result?.id || ""} onSelectResult={handleRestoreHistory} />
                </div>
              )}
            </div>
          )}

          {(appState === AppState.EDITOR || appState === AppState.GENERATING) && sourceImage && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-20 animate-fade-in items-start">
              <div className="lg:col-span-8 flex flex-col gap-8 lg:gap-14">
                <div className="glass-panel rounded-[2.5rem] lg:rounded-[4rem] shadow-2xl overflow-hidden relative group border-white/10 flex items-center justify-center min-h-[500px]">
                   <div className="p-2 lg:p-3 w-full flex justify-center">
                     <MaskCanvas 
                        key={sourceImage}
                        ref={maskCanvasRef} 
                        imageSrc={sourceImage} 
                        onMaskChange={setHasMask} 
                        previewBox={previewBox} 
                      />
                   </div>
                   {isGenerating && (
                     <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center">
                        <div className="relative mb-8 lg:mb-12">
                          <div className="animate-spin rounded-full h-24 w-24 lg:h-40 lg:w-40 border-t-2 border-b-2 border-secondary shadow-[0_0_70px_rgba(170,196,140,0.5)]"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles size={32} className="text-secondary animate-pulse lg:w-12 lg:h-12" />
                          </div>
                        </div>
                        <p className="text-2xl lg:text-4xl font-display font-bold text-white animate-pulse tracking-tight mb-2">
                          {orchestratedInstruction ? "Synthesizing Space..." : "Orchestrating Architecture..."}
                        </p>
                        <span className="text-[8px] lg:text-[10px] uppercase text-secondary font-black tracking-[0.3em] lg:tracking-[0.5em] opacity-60">Synchronizing design matrix</span>
                     </div>
                   )}
                </div>
              </div>
              <div className="lg:col-span-4 sticky top-28 lg:top-36">
                 <div className="glass-panel p-6 lg:p-12 rounded-[2.5rem] lg:rounded-[4rem] border border-white/10 shadow-2xl">
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
                <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6 mb-8 lg:mb-12">
                   <button onClick={() => setAppState(AppState.EDITOR)} className="group flex items-center self-start gap-4 pl-6 lg:pl-8 pr-8 lg:pr-10 py-4 lg:py-5 rounded-[1.5rem] lg:rounded-[2rem] bg-white/5 border border-white/10 text-white font-black uppercase tracking-[0.2em] text-[10px] lg:text-xs hover:bg-white/10 hover:text-secondary transition-all backdrop-blur-xl">
                     <ArrowLeft size={16} className="lg:w-5 lg:h-5 group-hover:-translate-x-1.5 transition-transform" />
                     Return
                   </button>
                   
                   <div className="flex flex-wrap gap-2 lg:gap-4">
                      <button 
                        onClick={() => setShowProductPins(!showProductPins)}
                        className={`px-6 lg:px-10 py-4 lg:py-5 rounded-[1.5rem] lg:rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] lg:text-xs flex items-center gap-3 lg:gap-4 transition-all border ${showProductPins ? 'bg-secondary text-background border-secondary' : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}
                      >
                        <Search size={18} className="lg:w-6 lg:h-6" />
                        Pins {showProductPins ? 'ON' : 'OFF'}
                      </button>

                      <button 
                        onClick={handleView3D}
                        disabled={isGeneratingDepth}
                        className="bg-white/5 text-white px-6 lg:px-10 py-4 lg:py-5 rounded-[1.5rem] lg:rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] lg:text-xs flex items-center gap-3 lg:gap-4 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50"
                      >
                        {isGeneratingDepth ? <div className="animate-spin h-4 w-4 lg:h-5 lg:w-5 border-2 border-white border-t-transparent rounded-full"/> : <Box size={18} className="lg:w-6 lg:h-6" />}
                        3D View
                      </button>

                      <button onClick={handleDownload} className="bg-white/5 text-white px-6 lg:px-10 py-4 lg:py-5 rounded-[1.5rem] lg:rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] lg:text-xs flex items-center gap-3 lg:gap-4 hover:bg-white/10 border border-white/10 transition-all">
                        <Download size={18} className="lg:w-6 lg:h-6" />
                        Save
                      </button>
                      
                      <button onClick={handleRefineResult} className="bg-primary hover:bg-secondary text-white px-8 lg:px-12 py-4 lg:py-5 rounded-[1.5rem] lg:rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] lg:text-xs flex items-center gap-3 lg:gap-4 shadow-[0_0_60px_rgba(106,122,90,0.5)] transition-all hover:scale-105 active:scale-95">
                        <Layers size={18} className="lg:w-6 lg:h-6" />
                        Refine
                      </button>
                   </div>
                </div>

                <div className="glass-panel rounded-[2.5rem] lg:rounded-[4rem] overflow-hidden shadow-2xl border-white/10 mb-8 lg:mb-12 relative group flex justify-center items-center bg-black/20">
                   <div className="w-full h-full flex items-center justify-center overflow-hidden">
                     <ImageSlider 
                      beforeImage={sourceImage || ""} 
                      afterImage={result.imageUrl} 
                      beforeLabel="Origin"
                      afterLabel="Architectural Render"
                     />
                   </div>
                   
                   {/* Product Discovery Overlay */}
                   <ProductVisualDiscovery 
                     products={shoppingItems} 
                     isVisible={showProductPins} 
                   />
                </div>
                
                {history.length > 0 && (
                   <div className="mb-12 lg:mb-24">
                     <HistoryPanel history={history} activeResultId={result.id} onSelectResult={handleRestoreHistory} />
                   </div>
                )}
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 lg:gap-14">
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
