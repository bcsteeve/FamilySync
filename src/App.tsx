import React, { useState, useEffect } from 'react';
import { User, CalendarEvent, TodoItem, ShoppingItem, AppView, SystemSettings, ShoppingStore, ShoppingCategory } from './types';
import { PALETTES, PaletteKey } from './constants';
import Calendar from './components/Calendar';
import Lists from './components/Lists';
import Settings from './components/Settings';
import EventModal from './components/EventModal';
import { Calendar as CalIcon, List as ListIcon, LogOut, Plus, Search, Undo, Redo, Loader2, Columns, Lock, User as UserIcon, AlertCircle, Shield } from 'lucide-react';
import { fetchWeather, WeatherData, fetchHolidays } from './services/integrations';
import { storage } from './services/storage';
import { UserContext } from './contexts/UserContext';
import { ThemeContext } from './contexts/ThemeContext';

interface HistoryState {
  events: CalendarEvent[];
  shopping: ShoppingItem[];
  todos: TodoItem[];
  users: User[]; 
}

const App: React.FC = () => {
  // --- Data State ---
  const [isLoaded, setIsLoaded] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isSetupMode, setIsSetupMode] = useState(false);
  // Config
  const [stores, setStores] = useState<ShoppingStore[]>([]);
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);

  const [paletteKey, setPaletteKey] = useState<PaletteKey>('STANDARD');
  const [settings, setSettings] = useState<SystemSettings>({
      weatherEnabled: true, weatherLocationStr: '', holidaysEnabled: true, holidayCountryCode: 'US'
  });

  // --- Undo/Redo State ---
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const [historyIdle, setHistoryIdle] = useState(false); 

  // --- External Data State ---
  const [weatherData, setWeatherData] = useState<WeatherData[]>([]);
  const [holidayEvents, setHolidayEvents] = useState<CalendarEvent[]>([]);

  // --- UI State ---
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Login State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Initialize View from LocalStorage
  const [view, setView] = useState<AppView>(() => {
      const saved = localStorage.getItem('fs_active_view');
      return (saved as AppView) || AppView.CALENDAR;
  });

  const [calendarViewMode, setCalendarViewMode] = useState<'WEEK' | 'MONTH' | 'AGENDA'>('WEEK');

  // Initialize List Tab from LocalStorage
  const [listTab, setListTab] = useState<'shopping' | 'todos'>(() => {
      const saved = localStorage.getItem('fs_active_list_tab');
      return (saved as 'shopping' | 'todos') || 'shopping';
  });

  // Effect to save View changes
  useEffect(() => {
      localStorage.setItem('fs_active_view', view);
  }, [view]);

  // Effect to save List Tab changes
  useEffect(() => {
      localStorage.setItem('fs_active_list_tab', listTab);
  }, [listTab]);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

// --- SINGLE BOOTSTRAP EFFECT ---
  useEffect(() => {
    const bootstrap = async () => {
        // 1. Authenticate / Re-validate
        if (storage.pb.authStore.isValid) {
            try {
                await storage.pb.collection('users').authRefresh();
            } catch (e) {
                console.warn("Auth token invalid (DB might have been reset). Clearing.");
                storage.pb.authStore.clear();
            }
        }

        // 2. If NOT logged in (or token was cleared above), Check Status
        if (!storage.pb.authStore.isValid) {
            try {
                const res = await fetch(`${storage.pb.baseUrl}/api/app_status`);
                const data = await res.json();
                if (data.setupRequired) {
                    setIsSetupMode(true);
                }
            } catch (e) {
                console.error("Failed to check app status", e);
            }
            setIsLoaded(true);
            return;
        }

        // 3. PRE-FLIGHT CHECK: Fetch Users FIRST
        // We do this separately to ensure the user actually exists in the DB
        // before we try to fetch data belonging to them. This prevents 400 errors.
        const savedUserId = storage.getAuthUser();
        setCurrentUserId(savedUserId);
        
        const users = await storage.getUsers();

        if (users.length === 0) {
            console.warn("Zombie Session Detected: Token valid but 0 users found. Forcing Setup.");
            storage.pb.authStore.clear();
            setCurrentUserId(null);
            setIsSetupMode(true);
            setIsLoaded(true);
            return; // <--- ABORT HERE. Shopping/Todos will never be fetched.
        }

        setUsers(users);

        // 4. If User is Valid, Fetch the Rest
        const results = await Promise.allSettled([
            storage.getEvents(),
            storage.getShopping(),
            storage.getTodos(),
            storage.getSettings(),
            storage.getPaletteKey(),
            storage.getStores(),
            storage.getCategories()
        ]);

        const getVal = <T,>(res: PromiseSettledResult<T>, def: T): T => 
            res.status === 'fulfilled' ? res.value : def;

        setEvents(getVal(results[0], []));
        setShopping(getVal(results[1], []));
        setTodos(getVal(results[2], []));
        setSettings(getVal(results[3], settings));
        setPaletteKey(getVal(results[4], 'STANDARD'));
        setStores(getVal(results[5], []));
        setCategories(getVal(results[6], []));

        try {
            const hol = await storage.getHolidays();
            setHolidayEvents(hol);
        } catch (e) { console.error("Holiday fetch failed", e); }
        
        setIsLoaded(true);
    };

    bootstrap();
  }, []);

/**
   * Universal Sync Logic (Optimistic UI Pattern)
   */
  const syncToBackend = async <T extends { id: string }>(
      currentItems: T[],
      newItems: T[],
      createFn: (item: T) => Promise<T>,
      updateFn: (item: T) => Promise<void>,
      deleteFn: (id: string) => Promise<void>,
      onIdSwap?: (tempId: string, realId: string) => void
  ) => {
      // 1. Detect Deletions: If it was in 'current' but not in 'new', it was deleted.
      const newIds = new Set(newItems.map(i => i.id));
      const deleted = currentItems.filter(i => !newIds.has(i.id));
      for (const item of deleted) {
          try { await deleteFn(item.id); } catch (e) { console.error(e); }
      }

      // 2. Detect Adds & Updates
      for (const item of newItems) {
          const oldItem = currentItems.find(i => i.id === item.id);
          
          if (!oldItem) {
              // It's New: Create in DB
              try {
                  const created = await createFn(item);
                  // CRITICAL: Swap the temporary client ID with the real server ID
                  if (onIdSwap && created.id !== item.id) {
                      onIdSwap(item.id, created.id);
                  }
              } catch (e) { console.error("Create failed", e); }
          } else {
              // It Exists: Check if it changed
              if (JSON.stringify(oldItem) !== JSON.stringify(item)) {
                  try { await updateFn(item); } catch (e) { console.error("Update failed", e); }
              }
          }
      }
  };

  const updateSettings = async (newSettings: SystemSettings) => {
      setSettings(newSettings);
      await storage.saveSettings(newSettings);
  };

  const updatePaletteKey = async (key: PaletteKey) => {
      setPaletteKey(key);
      await storage.savePaletteKey(key);
  };

const updateStores = async (newStores: ShoppingStore[]) => {
    // 1. Optimistic Update (UI updates immediately)
    setStores(newStores);

    // 2. Save to DB and get the ID swaps
    const idMap = await storage.saveStores(newStores);

    // 3. If any IDs changed, we must update React state to match the DB
    if (Object.keys(idMap).length > 0) {
        
        // A. Update the Stores List with Real IDs
        setStores(prev => prev.map(s => 
            idMap[s.id] ? { ...s, id: idMap[s.id] } : s
        ));

        // B. CRITICAL: Update Categories that referenced the old Temp Store IDs
        setCategories(prev => prev.map(c => 
            idMap[c.storeId] ? { ...c, storeId: idMap[c.storeId] } : c
        ));
    }
}

const updateCategories = async (newCats: ShoppingCategory[]) => {
    // 1. Optimistic Update
    setCategories(newCats);

    // 2. Save and get swaps
    const idMap = await storage.saveCategories(newCats);

    // 3. Update local state with real IDs so future edits work
    if (Object.keys(idMap).length > 0) {
        setCategories(prev => prev.map(c => 
            idMap[c.id] ? { ...c, id: idMap[c.id] } : c
        ));
    }
}

  const updateUsers = (newUsers: User[], skipHistory = false) => {
      if (JSON.stringify(newUsers) === JSON.stringify(users)) return;
      setUsers(newUsers);
      storage.saveUsers(newUsers);
  };

  const updateEvents = (newEvents: CalendarEvent[], skipHistory = false) => {
      if (JSON.stringify(newEvents) === JSON.stringify(events)) return;
      if (!skipHistory) pushToHistory();
      
      const oldEvents = events;
      setEvents(newEvents); 
      
      syncToBackend(
          oldEvents, 
          newEvents, 
          storage.createEvent, 
          storage.updateEvent, 
          storage.deleteEvent,
          (tempId, realId) => {
              setEvents(prev => prev.map(e => e.id === tempId ? { ...e, id: realId } : e));
          }
      );
  };

  const updateShopping = (newShopping: ShoppingItem[], skipHistory = false) => {
      if (JSON.stringify(newShopping) === JSON.stringify(shopping)) return;
      if (!skipHistory) pushToHistory();
      
      const oldShopping = shopping;
      setShopping(newShopping);
      
      syncToBackend(
          oldShopping, 
          newShopping, 
          storage.createShoppingItem, 
          storage.updateShoppingItem, 
          storage.deleteShoppingItem,
          (tempId, realId) => {
              setShopping(prev => prev.map(e => e.id === tempId ? { ...e, id: realId } : e));
          }
      );
  };

  const updateTodos = (newTodos: TodoItem[], skipHistory = false) => {
      if (JSON.stringify(newTodos) === JSON.stringify(todos)) return;
      if (!skipHistory) pushToHistory();

      const oldTodos = todos;
      setTodos(newTodos);

      syncToBackend(
          oldTodos, 
          newTodos, 
          storage.createTodo, 
          storage.updateTodo, 
          storage.deleteTodo,
          (tempId, realId) => {
              setTodos(prev => prev.map(e => e.id === tempId ? { ...e, id: realId } : e));
          }
      );
  };

  // --- History (Undo/Redo) ---
  const pushToHistory = () => {
      const currentState: HistoryState = { events, shopping, todos, users };
      setHistory(prev => {
          const newHistory = [...prev, currentState];
          if (newHistory.length > 50) return newHistory.slice(newHistory.length - 50);
          return newHistory;
      });
      setFuture([]); 
      setHistoryIdle(false);
  };

  useEffect(() => {
      setHistory([]);
      setFuture([]);
      setHistoryIdle(false);
  }, [view, listTab]);

  const undo = (e?: React.MouseEvent) => {
      if(e) e.stopPropagation();
      if (history.length === 0) return;
      const previousState = history[history.length - 1];
      const newHistory = history.slice(0, -1);
      
      const currentState: HistoryState = { events, shopping, todos, users };
      setFuture(prev => [currentState, ...prev]);
      setHistory(newHistory);
      
      updateEvents(previousState.events, true);
      updateShopping(previousState.shopping, true);
      updateTodos(previousState.todos, true);
      setUsers(previousState.users); storage.saveUsers(previousState.users);
      
      setHistoryIdle(false);
  };

  const redo = (e?: React.MouseEvent) => {
      if(e) e.stopPropagation();
      if (future.length === 0) return;
      const nextState = future[0];
      const newFuture = future.slice(1);
      
      const currentState: HistoryState = { events, shopping, todos, users };
      setHistory(prev => [...prev, currentState]);
      setFuture(newFuture);
      
      updateEvents(nextState.events, true);
      updateShopping(nextState.shopping, true);
      updateTodos(nextState.todos, true);
      setUsers(nextState.users); storage.saveUsers(nextState.users);
      
      setHistoryIdle(false);
  };

  // --- History Idle Logic ---
  useEffect(() => {
    if (history.length === 0 && future.length === 0) return;
    setHistoryIdle(false);
    const timer = setTimeout(() => { setHistoryIdle(true); }, 2000); 
    return () => clearTimeout(timer);
  }, [history, future]); 

  // --- Integrations (Weather & Holidays) ---
  useEffect(() => {
    if (!isLoaded || !currentUser) return;
    
    const checkWeather = async () => {
        if (!settings.weatherEnabled || !settings.weatherLat || !settings.weatherLon) {
            setWeatherData([]);
            return;
        }
        try {
            const wData = await fetchWeather(settings.weatherLat, settings.weatherLon);
            if (wData && wData.length > 0) {
                setWeatherData(wData);
            }
        } catch (e) {
            console.error(e);
        }
    };
    checkWeather();

    const refreshHolidays = async () => {
        if (!settings.holidaysEnabled) {
            setHolidayEvents([]);
            return;
        }

        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        const lastFetchTime = settings.lastHolidayFetch ? new Date(settings.lastHolidayFetch).getTime() : 0;
        
        if ((now - lastFetchTime) < ONE_DAY && holidayEvents.length > 0) return;

        try {
            const currentYear = new Date().getFullYear();
            
            // Fetch Current Year AND Next Year
            const [h1, h2] = await Promise.all([
                fetchHolidays(currentYear, settings.holidayCountryCode, settings.holidaySubdivisionCode),
                fetchHolidays(currentYear + 1, settings.holidayCountryCode, settings.holidaySubdivisionCode)
            ]);
            
            // Combine them
            const combined = [...h1, ...h2];
            
            if (combined.length > 0) {
                setHolidayEvents(combined);
                storage.saveHolidays(combined); 
                updateSettings({
                    ...settings,
                    lastHolidayFetch: new Date().toISOString()
                });
            }
        } catch (e) {
            console.error("Failed to refresh holidays", e);
        }
    };
    refreshHolidays();

  }, [isLoaded, settings.weatherEnabled, settings.weatherLat, settings.holidaysEnabled, settings.holidayCountryCode]);

  // --- Global Font Size & Theme ---
  const currentUser = users.find(u => u.id === currentUserId) || null;
  const activePalette = PALETTES[paletteKey] || PALETTES.STANDARD;

  // HELPER FUNCTION (UPDATED FOR CONTEXT)
  const getUserColor = (u: User) => {
      if (!u) return '#ccc';
      return activePalette[u.colorIndex % activePalette.length];
  };

  useEffect(() => {
    const scale = currentUser?.fontSizeScale || 1;
    document.documentElement.style.fontSize = `${scale * 100}%`;
  }, [currentUser]);

  useEffect(() => {
      const theme = currentUser?.preferences?.theme || 'LIGHT';
      if (theme === 'DARK') {
          document.documentElement.classList.add('dark');
      } else {
          document.documentElement.classList.remove('dark');
      }
  }, [currentUser]);


  // --- Event Modal State ---
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [initialModalDate, setInitialModalDate] = useState<Date | undefined>(undefined);

  const openNewEventModal = (date: Date) => {
    setSelectedEvent(null);
    setInitialModalDate(date);
    setIsEventModalOpen(true);
  };
  
  const openEditEventModal = (event: CalendarEvent, date?: Date) => {
    setSelectedEvent(event);
    setInitialModalDate(date); 
    setIsEventModalOpen(true);
  };
  
  const saveEvent = (e: CalendarEvent) => {
    let newEvents;
    if (selectedEvent) {
      newEvents = events.map(ev => ev.id === e.id ? e : ev);
    } else {
      newEvents = [...events, e];
    }
    updateEvents(newEvents);
  };
  
  const deleteEvent = (id: string) => {
    updateEvents(events.filter(e => e.id !== id));
    setIsEventModalOpen(false);
  };

// --- Login / Setup Handler ---
  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!loginUsername.trim() || !loginPassword.trim()) return;

      try {
          const user = await storage.loginUser(loginUsername, loginPassword);
          setCurrentUserId(user.id);
          setLoginError('');
          setLoginPassword('');
          // Force reload to get fresh data
          window.location.reload();
      } catch (err) {
          console.error(err);
          setLoginError('Invalid credentials');
      }
  };

  const handleSetup = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!loginUsername.trim() || !loginPassword.trim()) return;

      if (loginPassword.length < 8) {
          setLoginError("Password must be at least 8 characters.");
          return;
      }
      
      try {
          // Register user (also logs them in)
          await storage.registerUser(loginUsername, loginPassword);
          
          // Force a full reload to trigger the bootstrap process
          window.location.reload();
      } catch (err: any) {
          console.error(err);
          const pbMessage = err?.data?.message || err?.message || "Unknown error";
          setLoginError(`Failed to create user: ${pbMessage}`);
      }
  };

  if (!isLoaded) {
      return (
          <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
      );
  }

  // --- Login Screen ---
  if (!currentUser) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500 rounded-full blur-[100px] opacity-20 -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-500 rounded-full blur-[100px] opacity-20 translate-x-1/2 translate-y-1/2"></div>
        
        <div className="z-10 flex flex-col items-center w-full max-w-xs animate-in fade-in zoom-in-95 duration-500">
            <h1 className="text-5xl font-bold mb-2 tracking-tighter bg-gradient-to-r from-blue-400 to-purple-400 text-transparent bg-clip-text">FamilySync</h1>
            
            {isSetupMode ? (
                 <div className="text-center mb-8">
                     <span className="bg-blue-500/20 text-blue-300 text-xs font-bold px-2 py-1 rounded-full border border-blue-500/50">Setup</span>
                     <p className="text-gray-300 mt-3 text-sm">Create the <b>Family Admin</b> account.</p>
                 </div>
            ) : (
                 <p className="text-gray-400 mb-10 text-center text-sm">The data-dense dashboard for busy families.</p>
            )}
            
            <form onSubmit={isSetupMode ? handleSetup : handleLogin} className="w-full flex flex-col gap-4">
                <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                        type="text" 
                        placeholder={isSetupMode ? "Admin Name (e.g. Mom, Dad)" : "Username"}
                        value={loginUsername}
                        onChange={e => setLoginUsername(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                        type="password" 
                        placeholder={isSetupMode ? "Create Password" : "Password"}
                        value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>
                
                {loginError && (
                    <div className="text-red-400 text-xs font-bold flex items-center gap-2 bg-red-900/20 p-2 rounded-lg">
                        <AlertCircle size={14} /> {loginError}
                    </div>
                )}

                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-900/20 active:scale-95 transition-all mt-2 flex items-center justify-center gap-2">
                    {isSetupMode ? <><Plus size={18}/> Create Admin Account</> : 'Sign In'}
                </button>
            </form>
        </div>
      </div>
    );
  }

  // --- Main App Render ---
  return (
    <UserContext.Provider value={{ users, currentUser, updateUsers }}>
      <ThemeContext.Provider value={{ paletteKey, activePalette, updatePaletteKey, getUserColor }}>
        
        <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-900 relative">
          {/* Top Bar */}
          <div className="h-14 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 flex items-center px-4 justify-between shrink-0 z-20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-gray-100 dark:bg-gray-700 border overflow-hidden" style={{ borderColor: getUserColor(currentUser) }}>
                {currentUser.photoUrl ? <img src={currentUser.photoUrl} alt={currentUser.username} className="w-full h-full object-cover"/> : currentUser.avatar}
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">
                    {view === AppView.CALENDAR && 'Family Calendar'}
                    {view === AppView.LISTS && 'Lists'}
                    {view === AppView.SETTINGS && 'Settings'}
                </span>
                {currentUser.isAdmin && <span className="text-[0.5625rem] text-gray-400 font-semibold uppercase">Admin</span>}
              </div>
            </div>
          </div>

          {/* Content Container */}
          <div className="flex-1 overflow-hidden relative flex">
            
            {/* Main Panel */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
                {view === AppView.CALENDAR && (
                <Calendar 
                    events={events} 
                    viewMode={calendarViewMode}
                    onViewModeChange={setCalendarViewMode}
                    onEventClick={openEditEventModal}
                    onDateClick={openNewEventModal}
                    onUpdateEvents={updateEvents}
                    settings={settings}
                    weatherData={weatherData}
                    holidayEvents={holidayEvents}
                />
                )}
                {view === AppView.LISTS && (
                <Lists 
                    shoppingList={shopping}
                    todos={todos}
                    stores={stores}
                    categories={categories}
                    onUpdateShopping={updateShopping}
                    onUpdateTodos={updateTodos}
                    currentTab={listTab}
                    onTabChange={setListTab}
                />
                )}
                {view === AppView.SETTINGS && (
                <Settings 
                    events={events}
                    onUpdateEvents={updateEvents}
                    shopping={shopping}
                    onUpdateShopping={updateShopping}
                    todos={todos}
                    onUpdateTodos={updateTodos}
                    settings={settings}
                    onUpdateSettings={updateSettings}
                    stores={stores}
                    onUpdateStores={updateStores}
                    categories={categories}
                    onUpdateCategories={updateCategories}
                />
                )}
            </div>

            {/* Sidebar Panel */}
            {view !== AppView.SETTINGS && (
                <div className="hidden 2xl:flex w-96 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-col shrink-0 shadow-xl z-10">
                    <div className="p-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 text-gray-500 dark:text-gray-400 font-bold text-xs uppercase tracking-wider">
                        <Columns size={14} /> Dashboard
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        {view === AppView.CALENDAR ? (
                            <Lists 
                                shoppingList={shopping}
                                todos={todos}
                                stores={stores}
                                categories={categories}
                                onUpdateShopping={updateShopping}
                                onUpdateTodos={updateTodos}
                                currentTab={listTab}
                                onTabChange={setListTab}
                            />
                        ) : (
                            <Calendar 
                                events={events} 
                                viewMode="AGENDA"
                                onViewModeChange={() => {}}
                                onEventClick={openEditEventModal}
                                onDateClick={openNewEventModal}
                                onUpdateEvents={updateEvents}
                                settings={settings}
                                weatherData={weatherData}
                                holidayEvents={holidayEvents}
                                isSidebar={true}
                            />
                        )}
                    </div>
                </div>
            )}
          </div>

          {/* History Pill */}
          {(history.length > 0 || future.length > 0) && (
              <div 
                id="history-pill"
                className={`absolute bottom-20 left-4 z-40 bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 backdrop-blur-md shadow-xl rounded-full px-4 py-2 flex items-center gap-3 border border-gray-700 dark:border-gray-200 transition-all duration-500 ease-in-out group ${isMobile && historyIdle ? '-translate-x-[calc(100%-16px)] opacity-50 hover:translate-x-0 hover:opacity-100' : 'translate-x-0 opacity-100'}`}
                onMouseEnter={() => setHistoryIdle(false)}
                onClick={(e) => { e.stopPropagation(); setHistoryIdle(false); }}
              >
                  <button onClick={undo} disabled={history.length === 0} className="flex items-center gap-1 hover:text-blue-300 dark:hover:text-blue-600 disabled:opacity-30 text-xs font-bold uppercase tracking-wider">
                      <Undo size={14} /> Undo
                  </button>
                  <div className="w-px h-4 bg-gray-600 dark:bg-gray-300"></div>
                  <button onClick={redo} disabled={future.length === 0} className="flex items-center gap-1 hover:text-blue-300 dark:hover:text-blue-600 disabled:opacity-30 text-xs font-bold uppercase tracking-wider">
                      Redo <Redo size={14} />
                  </button>
              </div>
          )}

          {/* Modals */}
          <EventModal 
            isOpen={isEventModalOpen}
            onClose={() => setIsEventModalOpen(false)}
            event={selectedEvent}
            initialDate={initialModalDate}
            onSave={saveEvent}
            onDelete={deleteEvent}
          />

          {/* Nav */}
          <div className="h-16 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex shrink-0 pb-safe z-30">
            <button onClick={() => setView(AppView.CALENDAR)} className={`flex-1 flex flex-col items-center justify-center gap-1 ${view === AppView.CALENDAR ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
              <CalIcon size={24} strokeWidth={view === AppView.CALENDAR ? 2.5 : 2} />
              <span className="text-[0.625rem] font-bold uppercase">Calendar</span>
            </button>
            <button onClick={() => setView(AppView.LISTS)} className={`flex-1 flex flex-col items-center justify-center gap-1 ${view === AppView.LISTS ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
              <ListIcon size={24} strokeWidth={view === AppView.LISTS ? 2.5 : 2} />
              <span className="text-[0.625rem] font-bold uppercase">Lists</span>
            </button>
            <button onClick={() => setView(AppView.SETTINGS)} className={`flex-1 flex flex-col items-center justify-center gap-1 ${view === AppView.SETTINGS ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
              <Shield size={24} strokeWidth={view === AppView.SETTINGS ? 2.5 : 2} />
              <span className="text-[0.625rem] font-bold uppercase">Settings</span>
            </button>
            <button 
              onClick={() => { 
                  // 1. Clear PocketBase Auth
				  storage.pb.authStore.clear(); 
				  
				  // 2. Clear Local Storage prefs
				  localStorage.removeItem('fs_active_view'); 
				  localStorage.removeItem('fs_active_list_tab'); 
				  
				  // 3. Reset App State
				  setCurrentUserId(null); 
				  setIsSetupMode(false);
				  
				  // 4. SECURITY FIX: Wipe credentials from memory
				  setLoginUsername('');
				  setLoginPassword('');
              }} 
              className="flex-1 flex flex-col items-center justify-center gap-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
            >
              <LogOut size={24} />
              <span className="text-[0.625rem] font-bold uppercase">Logout</span>
            </button>
          </div>

        </div>

      </ThemeContext.Provider>
    </UserContext.Provider>
  );
};

export default App;