import React, { useState, useEffect, useRef } from 'react';
import { User, CalendarEvent, TodoItem, ShoppingItem, AppView, SystemSettings, ShoppingStore, ShoppingCategory } from './types';
import { PALETTES, PaletteKey } from './constants';
import Calendar from './components/Calendar';
import Lists from './components/Lists';
import Settings from './components/Settings';
import EventModal from './components/EventModal';
import { Calendar as CalIcon, List as ListIcon, LogOut, Plus, Search, Undo, Redo, Loader2, Columns, Lock, User as UserIcon, AlertCircle, Shield, Globe, Wifi, WifiOff } from 'lucide-react';
import { fetchWeather, WeatherData, fetchHolidays } from './services/integrations';
import { storage } from './services/storage';
import { pb } from './services/pb'; // Direct PB access for subscriptions
import { UserContext } from './contexts/UserContext';
import { ThemeContext } from './contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from './i18n';
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale, setDefaultLocale } from "react-datepicker";
import { enUS, es, fr, de, it, pt } from 'date-fns/locale';

// Register Locales for Datepicker
registerLocale('en', enUS);
registerLocale('en-US', enUS);
registerLocale('es', es);
registerLocale('fr', fr);
registerLocale('de', de);
registerLocale('it', it);
registerLocale('pt', pt);

interface HistoryState {
  events: CalendarEvent[];
  shopping: ShoppingItem[];
  todos: TodoItem[];
  users: User[]; 
}

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
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
  const [globalToast, setGlobalToast] = useState<{ msg: string, type: 'info' | 'success' } | null>(null);
  const [isServerLive, setIsServerLive] = useState(true);
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  // Ref for Realtime Callbacks (Prevents connection cycling)
  const currentUserRef = useRef<User | null>(null);

  // Login State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // --- Derived State (MUST BE DEFINED BEFORE EFFECTS) ---
  const currentUser = users.find(u => u.id === currentUserId) || null;
  
  // Update Ref whenever user changes
  useEffect(() => {
      currentUserRef.current = currentUser;
  }, [currentUser]);

  const activePalette = PALETTES[paletteKey] || PALETTES.STANDARD;

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

// --- REALTIME SUBSCRIPTIONS ---
  useEffect(() => {
      // Only subscribe if loaded and we have a valid session (currentUserId check is sufficient stability)
      if (!isLoaded || !currentUserId) return;

      const notify = (msg: string) => {
          setGlobalToast({ msg, type: 'info' });
          setTimeout(() => setGlobalToast(null), 3000);
      };

      // MAPPERS: Convert Raw DB Records -> Frontend Types
      const mapShopping = (r: any): ShoppingItem => ({
          id: r.id,
          content: r.content,
          note: r.note,
          isInCart: r.isInCart,
          isPrivate: r.isPrivate,
          addedByUserId: r.addedBy, 
          addedAt: r.created,       
          seenByUserIds: r.seenBy || [],
          priority: r.priority, 
          order: r.order,
          userCategoryIds: r.userCategoryIds || {},
          creatorCategoryId: r.category,
          logs: r.logs || []
      });

      const mapTodo = (r: any): TodoItem => ({
          id: r.id,
          content: r.content,
          note: r.note,
          isCompleted: r.isCompleted,
          userId: r.userId,
          priority: r.priority,
          deadline: r.deadline,
          isPrivate: r.isPrivate
      });

      const mapEvent = (r: any): CalendarEvent => ({
          id: r.id,
          title: r.title,
          description: r.description,
          startTime: r.startTime,
          endTime: r.endTime,
          isAllDay: r.isAllDay,
          userIds: r.participants || [], 
          rrule: r.rrule,
          icalUID: r.icalUID,
          exdates: r.exdates
      });

      // 1. Shopping Subscription
      pb.collection('shopping_items').subscribe('*', (e) => {
          const item = mapShopping(e.record);
          const selfId = currentUserRef.current?.id;
          
          if (e.action === 'create') {
              // IGNORE IF MINE (Optimistic)
              if (item.addedByUserId === selfId) return;
              
              setShopping(prev => [item, ...prev]);
              notify(t('notifications.item_added', { item: item.content }));
          } else if (e.action === 'update') {
              setShopping(prev => prev.map(i => i.id === item.id ? { ...i, ...item } : i));
          } else if (e.action === 'delete') {
              setShopping(prev => prev.filter(i => i.id !== item.id));
          }
      });

      // 2. Todos Subscription
      pb.collection('todos').subscribe('*', (e) => {
          const todo = mapTodo(e.record);
          const selfId = currentUserRef.current?.id;

          if (e.action === 'create') {
              if (todo.userId === selfId) return; // Ignore my own
              
              setTodos(prev => [todo, ...prev]);
              notify(t('notifications.todo_update'));
          } else if (e.action === 'update') {
              setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, ...todo } : t));
          } else if (e.action === 'delete') {
              setTodos(prev => prev.filter(t => t.id !== todo.id));
          }
      });

      // 3. Events Subscription
      pb.collection('events').subscribe('*', (e) => {
          const event = mapEvent(e.record);

          if (e.action === 'create') {
              setEvents(prev => {
                  // DEDUPE
                  if (prev.some(ev => ev.id === event.id || (ev.icalUID && ev.icalUID === event.icalUID))) {
                      return prev;
                  }
                  return [...prev, event];
              });
          } else if (e.action === 'update') {
              setEvents(prev => prev.map(ev => ev.id === event.id ? event : ev));
          } else if (e.action === 'delete') {
              setEvents(prev => prev.filter(ev => ev.id !== event.id));
          }
      });

      return () => {
          pb.collection('shopping_items').unsubscribe();
          pb.collection('todos').unsubscribe();
          pb.collection('events').unsubscribe();
      };
  }, [isLoaded, currentUserId]); // Depend on ID, not User Object, to stay stable

  // --- SERVER HEARTBEAT (Smart) ---
  useEffect(() => {
      let timer: any;

      const checkHealth = async () => {
          if (document.visibilityState === 'hidden') return;

          try {
              await pb.health.check();
              // If we were offline (or uninitialized) and now we are online...
              if (!isServerLive) {
                  setIsServerLive(true);
                  console.log("Connection restored! Syncing...");

                  if (isReadOnly) {
                      // Force login if connection comes back while in Read Only
                      setGlobalToast({ msg: t('app.connection_restored'), type: 'info' });
                      // We don't auto-logout here to avoid jarring UX, but we disable the "Offline" banner
                      // and show a "Login" prompt via the UI or toast.
                  } else {
                      // 1. Push our offline changes
                      await processMutationQueue();
                      // 2. Pull everyone else's changes
                      await refreshRemoteData();
                  }
              }
          } catch {
              if (isServerLive) setIsServerLive(false);
          }
      };

      checkHealth();
      timer = setInterval(checkHealth, 10000);

      const handleVisibility = () => {
          if (document.visibilityState === 'visible') {
              checkHealth(); 
              clearInterval(timer);
              timer = setInterval(checkHealth, 10000);
          } else {
              clearInterval(timer);
          }
      };

      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('online', checkHealth);
      window.addEventListener('offline', () => setIsServerLive(false));

      return () => {
          clearInterval(timer);
          document.removeEventListener('visibilitychange', handleVisibility);
          window.removeEventListener('online', checkHealth);
          window.removeEventListener('offline', () => setIsServerLive(false));
      };
  }, [isServerLive]);

  // --- REUSABLE DATA FETCHER ---
  const refreshRemoteData = async () => {
      try {
          console.log("Fetching fresh data from server...");
          const freshUsers = await storage.getUsers();
          if (freshUsers.length > 0) {
              setUsers(freshUsers);
              storage.saveLocal('users', freshUsers);
          }

          const [rEvents, rShopping, rTodos, rSettings, rPalette, rStores, rCats] = await Promise.all([
              storage.getEvents(),
              storage.getShopping(),
              storage.getTodos(),
              storage.getSettings(),
              storage.getPaletteKey(),
              storage.getStores(),
              storage.getCategories()
          ]);

          setEvents(rEvents); storage.saveLocal('events', rEvents);
          setShopping(rShopping); storage.saveLocal('shopping', rShopping);
          setTodos(rTodos); storage.saveLocal('todos', rTodos);
          setSettings(rSettings); storage.saveLocal('settings', rSettings);
          setPaletteKey(rPalette); storage.saveLocal('paletteKey', rPalette);
          setStores(rStores); storage.saveLocal('stores', rStores);
          setCategories(rCats); storage.saveLocal('categories', rCats);
          
          const hol = await storage.getHolidays();
          setHolidayEvents(hol);
          storage.saveLocal('holidays', hol);

          return true;
      } catch (e) {
          console.warn("Failed to refresh remote data", e);
          return false;
      }
  };

  // --- SINGLE BOOTSTRAP EFFECT (OFFLINE FIRST) ---
  useEffect(() => {
    const bootstrap = async () => {
        
        // 1. LOAD LOCAL CACHE IMMEDIATELY (No Blank Screen!)
        const savedUserId = storage.getAuthUser();
        setCurrentUserId(savedUserId);
        
        if (savedUserId) {
            setUsers(storage.loadLocal('users', []));
            setEvents(storage.loadLocal('events', []));
            setShopping(storage.loadLocal('shopping', []));
            setTodos(storage.loadLocal('todos', []));
            setSettings(storage.loadLocal('settings', settings));
            setPaletteKey(storage.loadLocal('paletteKey', 'STANDARD'));
            setStores(storage.loadLocal('stores', []));
            setCategories(storage.loadLocal('categories', []));
            setHolidayEvents(storage.loadLocal('holidays', []));
        }

        setIsLoaded(true);

        // 2. NETWORK SYNC (Background)
        try {
            // A. Check Auth Validity with Offline Tolerance
            if (storage.pb.authStore.isValid) {
                try {
                    await storage.pb.collection('users').authRefresh();
                } catch (e: any) {
                    // CRITICAL CHANGE: Differentiate between "Blocked" (401) and "Offline" (0/500)
                    if (e.status === 401) {
                        console.warn("Auth token invalid/expired. Logging out.");
                        storage.pb.authStore.clear();
                        setCurrentUserId(null); // Kick user to login
                        // Re-check setup mode since we are logged out
                        try {
                            const res = await fetch(`${storage.pb.baseUrl}/api/app_status`);
                            const data = await res.json();
                            if (data.setupRequired) setIsSetupMode(true);
                        } catch {}
                        return;
                    } else {
                        console.warn("Auth check failed but token might still be good. Assuming offline.");
                        // DO NOT clear auth. Let them stay "logged in" offline.
                    }
                }
            }

            // B. Check Setup Status (Only if no auth)
            if (!storage.pb.authStore.isValid) {
                try {
                    const res = await fetch(`${storage.pb.baseUrl}/api/app_status`);
                    const data = await res.json();
                    if (data.setupRequired) setIsSetupMode(true);
                } catch (e) { /* Likely offline */ }
                return;
            }

            // C. Fetch Live Data
            const success = await refreshRemoteData();
            
            if (success) {
                setIsServerLive(true);
                processMutationQueue(); 
            } else {
                setIsServerLive(false);
            }

        } catch (e) {
            console.error("Critical Bootstrap Error", e);
        }
    };

    bootstrap();
  }, []);

  // --- QUEUE PROCESSOR ---
  const processMutationQueue = async () => {
      const queue = storage.getQueue();
      if (queue.length === 0) return;

      console.log(`Processing ${queue.length} offline actions...`);
      
      // We process sequentially to maintain order
      for (const action of queue) {
          try {
              if (action.type === 'CREATE') {
                  if (action.collection === 'shopping') {
                       const created = await storage.createShoppingItem(action.payload);
                       // Swap ID in local state
                       if (action.tempId) {
                           setShopping(prev => prev.map(i => i.id === action.tempId ? { ...i, id: created.id } : i));
                       }
                  } else if (action.collection === 'todos') {
                      const created = await storage.createTodo(action.payload);
                      if (action.tempId) {
                          setTodos(prev => prev.map(i => i.id === action.tempId ? { ...i, id: created.id } : i));
                      }
                  } else if (action.collection === 'events') {
                      const created = await storage.createEvent(action.payload);
                      if (action.tempId) {
                           setEvents(prev => prev.map(i => i.id === action.tempId ? { ...i, id: created.id } : i));
                      }
                  }
              } else if (action.type === 'UPDATE') {
                  if (action.collection === 'shopping') await storage.updateShoppingItem(action.payload);
                  if (action.collection === 'todos') await storage.updateTodo(action.payload);
                  if (action.collection === 'events') await storage.updateEvent(action.payload);
              } else if (action.type === 'DELETE') {
                  if (action.collection === 'shopping') await storage.deleteShoppingItem(action.payload); // payload is ID
                  if (action.collection === 'todos') await storage.deleteTodo(action.payload);
                  if (action.collection === 'events') await storage.deleteEvent(action.payload);
              }
              
              // If successful, remove from queue
              storage.removeFromQueue(action.timestamp);

          } catch (e) {
              console.error("Failed to replay action", action, e);
              // We leave it in the queue? Or remove it to prevent blocking? 
              // For now, we leave it. Ideally, we need retry counts.
          }
      }
  };

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
      storage.saveLocal('settings', newSettings); // Persist
      try { await storage.saveSettings(newSettings); } catch (e) { /* Queue logic not needed for settings yet */ }
  };
  const updatePaletteKey = async (key: PaletteKey) => {
      setPaletteKey(key);
      storage.saveLocal('paletteKey', key); // Persist
      try { await storage.savePaletteKey(key); } catch (e) {}
  };
  const updateStores = async (newStores: ShoppingStore[]) => {
    setStores(newStores);
    storage.saveLocal('stores', newStores); // Persist
    
    // Simplification for offline stores: We just try to save. 
    // Full offline support for Store/Category structural changes is complex (ID dependency).
    // For now, we wrap in try/catch so it doesn't crash.
    try {
        const idMap = await storage.saveStores(newStores);
        if (Object.keys(idMap).length > 0) {
            setStores(prev => prev.map(s => idMap[s.id] ? { ...s, id: idMap[s.id] } : s));
            const updatedCategories = categories.map(c => idMap[c.storeId] ? { ...c, storeId: idMap[c.storeId] } : c);
            setCategories(updatedCategories);
            storage.saveLocal('stores', newStores); // Save again with real IDs
            storage.saveLocal('categories', updatedCategories);
            
            // Fix categories on server
            const catsToUpdate = updatedCategories.filter(c => idMap[c.storeId || '']);
            for (const cat of catsToUpdate) {
                try { await storage.pb.collection('shopping_categories').update(cat.id, cat); } catch (e) {}
            }
        }
    } catch (e) { console.warn("Offline: Stores saved locally only."); }
}

const updateCategories = async (newCats: ShoppingCategory[]) => {
    setCategories(newCats);
    storage.saveLocal('categories', newCats); // Persist
    try {
        const idMap = await storage.saveCategories(newCats);
        if (Object.keys(idMap).length > 0) {
            setCategories(prev => prev.map(c => idMap[c.id] ? { ...c, id: idMap[c.id] } : c));
            storage.saveLocal('categories', newCats); // Save again with real IDs
        }
    } catch (e) { console.warn("Offline: Categories saved locally only."); }
}

  const updateUsers = (newUsers: User[], skipHistory = false) => {
      if (JSON.stringify(newUsers) === JSON.stringify(users)) return;
      setUsers(newUsers);
      storage.saveLocal('users', newUsers);
      storage.saveUsers(newUsers).catch(() => {});
  };

  // --- UNIVERSAL SYNC WRAPPER WITH OFFLINE QUEUE ---
  const handleUpdate = <T extends { id: string }>(
      collectionName: 'events' | 'shopping' | 'todos',
      currentList: T[],
      newList: T[],
      setter: (items: T[]) => void,
      skipHistory: boolean,
      createFn: (i: T) => Promise<T>,
      updateFn: (i: T) => Promise<void>,
      deleteFn: (id: string) => Promise<void>
  ) => {
      if (isReadOnly) return; // Block all updates in Read Only mode
      if (JSON.stringify(newList) === JSON.stringify(currentList)) return;
      if (!skipHistory) pushToHistory();

      // 1. Optimistic Update & Local Persistence
      setter(newList);
      storage.saveLocal(collectionName, newList);

      // 2. Diffing & Network / Queue
      syncToBackend(
          currentList,
          newList,
          // Create Wrapper
          async (item) => {
              try { return await createFn(item); } 
              catch (e) { 
                  storage.addToQueue({ type: 'CREATE', collection: collectionName, payload: item, tempId: item.id });
                  throw e; // Rethrow to stop syncToBackend from thinking it succeeded
              }
          },
          // Update Wrapper
          async (item) => {
              try { await updateFn(item); }
              catch (e) {
                  storage.addToQueue({ type: 'UPDATE', collection: collectionName, payload: item });
              }
          },
          // Delete Wrapper
          async (id) => {
              try { await deleteFn(id); }
              catch (e) {
                  storage.addToQueue({ type: 'DELETE', collection: collectionName, payload: id });
              }
          },
          // ID Swap
          (tempId, realId) => {
              setter(prev => (prev as any[]).map((e: any) => e.id === tempId ? { ...e, id: realId } : e));
              // Note: We don't need to re-save local here, React effect/next render will catch it eventually,
              // or we can force it, but let's keep it simple.
          }
      );
  }

  const updateEvents = (newEvents: CalendarEvent[], skipHistory = false) => {
      handleUpdate('events', events, newEvents, setEvents, skipHistory, storage.createEvent, storage.updateEvent, storage.deleteEvent);
  };

  const updateShopping = (newShopping: ShoppingItem[], skipHistory = false) => {
      handleUpdate('shopping', shopping, newShopping, setShopping, skipHistory, storage.createShoppingItem, storage.updateShoppingItem, storage.deleteShoppingItem);
  };

  const updateTodos = (newTodos: TodoItem[], skipHistory = false) => {
      handleUpdate('todos', todos, newTodos, setTodos, skipHistory, storage.createTodo, storage.updateTodo, storage.deleteTodo);
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
        
        // Cache Busting: Did the region change?
        const currentParams = `${settings.holidayCountryCode}|${settings.holidaySubdivisionCode || ''}`;
        const paramsChanged = currentParams !== settings.lastHolidayParams;

        // If params match AND it's been less than a day, skip fetch
        if (!paramsChanged && (now - lastFetchTime) < ONE_DAY && holidayEvents.length > 0) return;

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
                    lastHolidayFetch: new Date().toISOString(),
                    lastHolidayParams: currentParams
                });
            }
        } catch (e) {
            console.error("Failed to refresh holidays", e);
        }
    };
    refreshHolidays();

  }, [isLoaded, settings.weatherEnabled, settings.weatherLat, settings.holidaysEnabled, settings.holidayCountryCode, settings.holidaySubdivisionCode]);

  // --- Global Font Size & Theme ---
  // (currentUser moved to top)

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
      // 1. If User Logged In: Respect their preference
      if (currentUser) {
          const theme = currentUser.preferences?.theme || 'LIGHT';
          if (theme === 'DARK') document.documentElement.classList.add('dark');
          else document.documentElement.classList.remove('dark');      } else {
          // 2. If Login Screen: Respect System Preference
          if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
              document.documentElement.classList.add('dark');
          } else {
              document.documentElement.classList.remove('dark');
          }
	  }
  }, [currentUser]);

  useEffect(() => {
      if (currentUser?.preferences?.language) {
          i18n.changeLanguage(currentUser.preferences.language);
          // Sync Datepicker Locale
          const lang = currentUser.preferences.language.split('-')[0];
          setDefaultLocale(lang); 
      }
  }, [currentUser, i18n]);

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
          setIsReadOnly(false);
          setLoginError('');
          setLoginPassword('');
          // Force reload to get fresh data
          window.location.reload();
      } catch (err: any) {
          console.error(err);
          // Explicitly check for 400 (Invalid Credentials)
          if (err.status === 400) {
              setLoginError(t('messages.invalid_creds'));
          } else {
              // Treat 0 (Offline), undefined (Network Error), or 5xx (Server Error) as connection issues
              setLoginError(t('messages.server_unreachable'));
          }
      }
  };

  const handleSetup = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!loginUsername.trim() || !loginPassword.trim()) return;

      if (loginPassword.length < 8) {
          setLoginError(t('messages.pass_min_chars'));
          return;
      }
      
      try {
          // Register user (also logs them in)
          await storage.registerUser(loginUsername, loginPassword);
          
          // Force a full reload to trigger the bootstrap process
          window.location.reload();
      } catch (err: any) {
          console.error(err);
          if (err.status === 0) {
              setLoginError(t('messages.server_unreachable'));
          } else {
              const pbMessage = err?.data?.message || err?.message || "Unknown error";
              setLoginError(t('messages.create_fail', { error: pbMessage }));
          }
      }
  };
  
  const handleOfflineLogin = () => {
      const lastId = storage.getLastActiveUser();
      if (lastId) {
          const u = users.find(u => u.id === lastId);
          if (u) {
              setCurrentUserId(u.id);
              setIsReadOnly(true);
          }
      }
  }

  if (!isLoaded) {
      return (
          <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <Loader2 className="animate-spin text-blue-500" size={48} title={t('app.loading')} />
          </div>
      );
  }

  // --- Login Screen ---
  if (!currentUser) {
    const lastActiveId = storage.getLastActiveUser();
    const cachedUser = lastActiveId ? users.find(u => u.id === lastActiveId) : null;

    return (
      <div className={`h-dvh w-full flex flex-col items-center justify-center p-6 relative overflow-hidden transition-colors duration-300 
        ${!isServerLive ? 'border-t-4 border-l-4 border-r-4 border-red-500 bg-red-50/30 dark:bg-red-900/10' : 'bg-gray-100 dark:bg-gray-900'} 
        text-gray-900 dark:text-white`}>
        
        {/* Offline Banner */}
        {!isServerLive && (
             <div className="absolute top-0 left-0 w-full bg-red-500 text-white text-[10px] uppercase tracking-widest font-bold text-center py-0.5 z-50">
                 {t('app.offline_mode')}
             </div>
        )}

        <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500 rounded-full blur-[100px] opacity-20 -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-500 rounded-full blur-[100px] opacity-20 translate-x-1/2 translate-y-1/2"></div>
        
        {/* Language Dropdown (Top Right) */}
        <div className="absolute top-6 right-6 z-20 group">
            {/* 1. VISUAL LAYER (Perfectly styled text) */}
            <div className="flex items-center gap-2 text-gray-500 hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer pl-2 pr-6">
                <Globe size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">
                    {isMobile ? i18n.language?.toUpperCase() : new Intl.DisplayNames([i18n.language], { type: 'language' }).of(i18n.language)}
                </span>
            </div>

            {/* 2. FUNCTIONAL LAYER (Invisible overlay) */}
            <select
                value={i18n.language}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
                {SUPPORTED_LANGUAGES.map(lang => (
                    <option key={lang} value={lang} className="text-gray-900 bg-white dark:bg-gray-800 dark:text-white">
                        {/* Mobile: "EN" | Desktop: "English" */}
                        {isMobile ? lang.toUpperCase() : new Intl.DisplayNames([lang], { type: 'language' }).of(lang)}
                    </option>
                ))}
            </select>
        </div>

        <div className="z-10 flex flex-col items-center w-full max-w-xs animate-in fade-in zoom-in-95 duration-500">
            <h1 className="text-5xl font-bold mb-2 tracking-tighter bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 text-transparent bg-clip-text">{t('app.title')}</h1>
            
            {isSetupMode ? (
                 <div className="text-center mb-8">
                     <span className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/50 text-xs font-bold px-2 py-1 rounded-full border">{t('auth.setup')}</span>
                     <p className="text-gray-600 dark:text-gray-300 mt-3 text-sm">{t('auth.create_admin')}</p>
                 </div>
            ) : (
                 <p className="text-gray-500 dark:text-gray-400 mb-10 text-center text-sm">{t('app.tagline')}</p>
            )}
            
            <form onSubmit={isSetupMode ? handleSetup : handleLogin} className="w-full flex flex-col gap-4">
                <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
                    <input 
                        type="text" 
                        placeholder={t('auth.username')}
                        value={loginUsername}
                        onChange={e => setLoginUsername(e.target.value)}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-3 pl-10 pr-4 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                    />
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
                    <input 
                        type="password" 
                        placeholder={t('auth.password')}
                        value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-3 pl-10 pr-4 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                    />
                </div>
                
                {loginError && (
                    <div className="text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-2 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-900/50">
                        <AlertCircle size={14} /> {loginError}
                    </div>
                )}

                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-900/20 active:scale-95 transition-all mt-2 flex items-center justify-center gap-2">
                    {isSetupMode ? <><Plus size={18}/> {t('auth.create_admin')}</> : t('auth.sign_in')}
                </button>

                {/* Cached User / Read Only Login */}
                {!isServerLive && cachedUser && !isSetupMode && (
                    <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 w-full flex flex-col items-center gap-2">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            {t('auth.offline_user', { name: cachedUser.username })}
                        </div>
                        <button 
                            type="button" 
                            onClick={handleOfflineLogin}
                            className="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold py-3 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <Shield size={18} /> {t('auth.view_offline')}
                        </button>
                    </div>
                )}
            </form>
        </div>
      </div>
    );
  }

  // --- Main App Render ---
  return (
    <UserContext.Provider value={{ users, currentUser, updateUsers }}>
      <ThemeContext.Provider value={{ paletteKey, activePalette, updatePaletteKey, getUserColor }}>
        
        {/* FIX: Use h-dvh (Dynamic Viewport Height) to respect mobile browser bars */}
        <div className={`h-dvh w-full flex flex-col relative overflow-hidden transition-colors duration-200 
            ${!isServerLive ? 'border-t-4 border-l-4 border-r-4 border-red-500 bg-red-50/30 dark:bg-red-900/10' : 'bg-gray-100 dark:bg-gray-900'}`}>
          
          {/* Offline Header Banner (Unobtrusive) */}
          {(!isServerLive || isReadOnly) && (
               <div className={`w-full text-white text-[10px] uppercase tracking-widest font-bold text-center py-0.5 shrink-0 flex justify-between px-4 items-center ${isReadOnly ? 'bg-orange-500' : 'bg-red-500'}`}>
                   <span>{isReadOnly ? t('app.read_only_mode') : t('app.offline_mode')}</span>
                   {isReadOnly && isServerLive && (
                       <button onClick={() => setCurrentUserId(null)} className="underline hover:no-underline">{t('app.login_to_sync')}</button>
                   )}
               </div>
           )}

          {/* Top Bar */}
          <div className="h-14 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 flex items-center px-4 justify-between shrink-0 z-20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-gray-100 dark:bg-gray-700 border overflow-hidden" style={{ borderColor: getUserColor(currentUser) }}>
                {currentUser.photoUrl ? <img src={currentUser.photoUrl} alt={currentUser.username} className="w-full h-full object-cover"/> : currentUser.avatar}
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">
                    {view === AppView.CALENDAR && t('app.calendar')}
                    {view === AppView.LISTS && t('app.lists')}
                    {view === AppView.SETTINGS && t('app.settings')}
                </span>
                {currentUser.isAdmin && <span className="text-[0.5625rem] text-gray-400 font-semibold uppercase">{t('app.admin')}</span>}
              </div>
            </div>

            {/* Global Language Switcher (Authenticated View) */}
            <div className="relative group flex items-center">
                {/* 1. VISUAL LAYER */}
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-gray-200 transition-colors cursor-pointer pl-2 pr-6">
                    <Globe size={14} />
                    <span className="text-xs font-bold uppercase tracking-wider">
                        {isMobile ? i18n.language?.toUpperCase() : new Intl.DisplayNames([i18n.language], { type: 'language' }).of(i18n.language)}
                    </span>
                </div>

                {/* 2. FUNCTIONAL LAYER */}
                <select
                    id="languageSelector"
                    name="languageSelector"
                    value={i18n.language}
                    onChange={(e) => {
                        // 1. Update i18n immediately
                        i18n.changeLanguage(e.target.value);
                        // 2. Persist to User Preferences
                        const updatedUsers = users.map(u => 
                            u.id === currentUser.id ? { ...u, preferences: { ...u.preferences!, language: e.target.value } } : u
                        );
                        updateUsers(updatedUsers, true); // true = skip undo history for this
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                    {SUPPORTED_LANGUAGES.map(lang => (
                         <option key={lang} value={lang} className="text-gray-900 bg-white dark:bg-gray-800 dark:text-white">
                             {/* Use language code (EN/ES) for compactness in top bar */}
                            {isMobile ? lang.toUpperCase() : new Intl.DisplayNames([lang], { type: 'language' }).of(lang)}
                         </option>
                     ))}
                </select>
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
                    isReadOnly={isReadOnly}
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
                    isReadOnly={isReadOnly}
                />
                )}
            </div>

            {/* Sidebar Panel */}
            {view !== AppView.SETTINGS && (
                <div className="hidden 2xl:flex w-96 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-col shrink-0 shadow-xl z-10">
                    <div className="p-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 text-gray-500 dark:text-gray-400 font-bold text-xs uppercase tracking-wider">
                        <Columns size={14} /> {t('calendar.agenda')}
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
                                isReadOnly={isReadOnly}
                            />
                        ) : (
                            <Calendar 
                                events={events} 
                                viewMode="AGENDA"
                                onViewModeChange={() => {}}
                                onEventClick={isReadOnly ? () => {} : openEditEventModal}
                                onDateClick={isReadOnly ? () => {} : openNewEventModal}
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

          {/* Global Toast Notification */}
		  
          {globalToast && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[150] animate-in slide-in-from-top-2 fade-in duration-300 pointer-events-none">
                  <div className="bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 px-6 py-3 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3 font-bold text-sm border border-gray-700 dark:border-gray-200">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"/>
                      {globalToast.msg}
                  </div>
              </div>
          )}

          {/* History Pill */}
          {(history.length > 0 || future.length > 0) && (
              <div 
                id="history-pill"
                className={`absolute bottom-20 left-4 z-40 bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 backdrop-blur-md shadow-xl rounded-full px-4 py-2 flex items-center gap-3 border border-gray-700 dark:border-gray-200 transition-all duration-500 ease-in-out group ${isMobile && historyIdle ? '-translate-x-[calc(100%-16px)] opacity-50 hover:translate-x-0 hover:opacity-100' : 'translate-x-0 opacity-100'}`}
                onMouseEnter={() => setHistoryIdle(false)}
                onClick={(e) => { e.stopPropagation(); setHistoryIdle(false); }}
              >
                  <button onClick={undo} disabled={history.length === 0} className="flex items-center gap-1 hover:text-blue-300 dark:hover:text-blue-600 disabled:opacity-30 text-xs font-bold uppercase tracking-wider">
                      <Undo size={14} /> {t('app.undo')}
                  </button>
                  <div className="w-px h-4 bg-gray-600 dark:bg-gray-300"></div>
                  <button onClick={redo} disabled={future.length === 0} className="flex items-center gap-1 hover:text-blue-300 dark:hover:text-blue-600 disabled:opacity-30 text-xs font-bold uppercase tracking-wider">
                      {t('app.redo')} <Redo size={14} />
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
              <span className="text-[0.625rem] font-bold uppercase">{t('app.calendar')}</span>
            </button>
            <button onClick={() => setView(AppView.LISTS)} className={`flex-1 flex flex-col items-center justify-center gap-1 ${view === AppView.LISTS ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
              <ListIcon size={24} strokeWidth={view === AppView.LISTS ? 2.5 : 2} />
              <span className="text-[0.625rem] font-bold uppercase">{t('app.lists')}</span>
            </button>
            <button onClick={() => setView(AppView.SETTINGS)} className={`flex-1 flex flex-col items-center justify-center gap-1 ${view === AppView.SETTINGS ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
              <Shield size={24} strokeWidth={view === AppView.SETTINGS ? 2.5 : 2} />
              <span className="text-[0.625rem] font-bold uppercase">{t('app.settings')}</span>
            </button>
            <button 
              onClick={() => { 
                  // 1. Reset App State (Triggers cleanup effect while Auth is still valid)
				  setCurrentUserId(null); 
                  setIsReadOnly(false);
				  setIsSetupMode(false);

                  // 2. Clear Local Storage prefs
				  localStorage.removeItem('fs_active_view'); 
				  localStorage.removeItem('fs_active_list_tab'); 
                  // NOTE: We DO NOT clear fs_cache_* or fs_last_active_user to allow offline re-entry.

                  // 3. Clear PocketBase Auth (Delayed slightly to allow unsubscribe to fire)
                  setTimeout(() => {
				      storage.pb.authStore.clear(); 
				      setLoginUsername('');
				      setLoginPassword('');
                  }, 50);
              }} 
              className="flex-1 flex flex-col items-center justify-center gap-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
            >
              <LogOut size={24} />
              <span className="text-[0.625rem] font-bold uppercase">{t('app.logout')}</span>
            </button>
          </div>

        </div>

      </ThemeContext.Provider>
    </UserContext.Provider>
  );
};

export default App;