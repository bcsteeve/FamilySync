import React, { useState, useRef, useEffect } from 'react';
import { User, CalendarEvent, ShoppingItem, TodoItem, SystemSettings, ShoppingStore, ShoppingCategory } from '../types';
import { PALETTES, PaletteKey } from '../constants';
import { Shield, UserPlus, Trash2, AlertTriangle, Edit2, Check, X, Palette, Download, Upload, Database, CloudSun, Search, MapPin, Store, GripVertical, Image as ImageIcon, Smile, Calendar, Lock, Key, CheckCircle, Type, Plus, HelpCircle, FileDown, FileUp, WifiOff } from 'lucide-react';
import { fetchAvailableCountries, getUniqueSubdivisions, CountryInfo, searchCity } from '../services/integrations';
import { storage } from '../services/storage';
import { generateICS, parseICS } from '../services/ical';
import { saveAs } from 'file-saver';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import DatePicker from 'react-datepicker';

interface SettingsProps {
  events: CalendarEvent[];
  onUpdateEvents: (events: CalendarEvent[], skipHistory?: boolean) => void;
  shopping: ShoppingItem[];
  onUpdateShopping: (items: ShoppingItem[], skipHistory?: boolean) => void;
  todos: TodoItem[];
  onUpdateTodos: (items: TodoItem[], skipHistory?: boolean) => void;

  settings: SystemSettings;
  onUpdateSettings: (settings: SystemSettings) => void;

  stores: ShoppingStore[];
  onUpdateStores: (stores: ShoppingStore[]) => void;
  categories: ShoppingCategory[];
  onUpdateCategories: (categories: ShoppingCategory[]) => void;
  isReadOnly?: boolean;
  isServerLive?: boolean;
}

const EMOJI_LIST = ['👨', '👩', '👦', '👧', '👶', '👴', '👵', '🙂', '😎', '🤓', '🤠', '👽', '🤖', '👻', '🐶', '🐱', '🦊', '🐻', '🐼', '🐨'];

const Settings: React.FC<SettingsProps> = ({ 
  events, onUpdateEvents, shopping, onUpdateShopping, todos, onUpdateTodos,
  settings, onUpdateSettings, stores, onUpdateStores, categories, onUpdateCategories,
  isReadOnly, isServerLive = true
}) => {
  // CONTEXT HOOKS
  const { t, i18n } = useTranslation();
  const { users, currentUser, updateUsers: onUpdateUsers } = useUser();
  const { paletteKey, activePalette, updatePaletteKey: onUpdatePaletteKey } = useTheme();

  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const [passModalUser, setPassModalUser] = useState<User | null>(null);
  const [passOld, setPassOld] = useState('');
  const [passNew, setPassNew] = useState('');
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState(''); 
  
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<any[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);

  const [countries, setCountries] = useState<CountryInfo[]>([]);
  const [subdivisions, setSubdivisions] = useState<string[]>([]);
  const [loadingSubdivisions, setLoadingSubdivisions] = useState(false);
  
  const [pruneDate, setPruneDate] = useState('');

  const [pruneStatus, setPruneStatus] = useState<{type: 'success'|'error', msg: string} | null>(null);
  const [backupStatus, setBackupStatus] = useState<{type: 'success'|'error', msg: string} | null>(null);
  const [importStatus, setImportStatus] = useState<{type: 'success'|'error', msg: string} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const icalInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [newStoreName, setNewStoreName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatStoreId, setNewCatStoreId] = useState<string>(''); 
  
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editStoreName, setEditStoreName] = useState('');

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatStoreId, setEditCatStoreId] = useState<string>('');

  const [validationError, setValidationError] = useState<{id: string, msg: string} | null>(null);

  const [draggedStoreId, setDraggedStoreId] = useState<string | null>(null);
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [dragOverStoreId, setDragOverStoreId] = useState<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);

  const getColor = (index: number) => activePalette[index % activePalette.length];


  const openEditUser = (u: User) => {
      setAvatarFile(null);
      setEditingUser(u);
  };

  useEffect(() => {
      const loadCountries = async () => {
          const list = await fetchAvailableCountries();
          setCountries(list);
      };
      loadCountries();
  }, []);

  useEffect(() => {
    // Auto-select first store if none selected OR if selected ID no longer exists (ID Swap)
    if (stores.length > 0) {
        const isValid = stores.find(s => s.id === newCatStoreId);
        if (!newCatStoreId || !isValid) {
            setNewCatStoreId(stores[0].id);
        }
    }
  }, [stores, newCatStoreId]);

  useEffect(() => {
      const loadSubs = async () => {
          if (settings.holidayCountryCode) {
              setLoadingSubdivisions(true);
              const subs = await getUniqueSubdivisions(new Date().getFullYear(), settings.holidayCountryCode);
              setSubdivisions(subs);
              setLoadingSubdivisions(false);
          }
      };
      loadSubs();
  }, [settings.holidayCountryCode]);

  // Lock settings if Read Only (Logged Out) OR Server is Offline
  // (Placed here to ensure all hooks run BEFORE this conditional return)
  if (isReadOnly || !isServerLive) {
      const isOfflineLock = !isReadOnly && !isServerLive;
      
      return (
          <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-6 text-center">
              <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-sm w-full animate-in zoom-in-95 duration-200">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isOfflineLock ? 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-500 dark:text-orange-400'}`}>
                      {isOfflineLock ? <WifiOff size={32} /> : <Lock size={32} />}
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{t('settings.security_lock')}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                      {isOfflineLock ? t('settings.offline_lock_desc') : t('settings.read_only_desc')}
                  </p>
              </div>
          </div>
      );
  }

  if (!currentUser) return null;

  const triggerValidationError = (id: string, msg: string) => {
      setValidationError({ id, msg });
      setTimeout(() => setValidationError(null), 2000);
  };

const addUser = async () => {
    const cleanName = newUserName.trim();
    const cleanPass = newUserPass.trim();

    if (!cleanName || !cleanPass) return;
    
    if (cleanPass.length < 8) {
        triggerValidationError('new-user-pass', t('messages.pass_min_chars'));
        return;
    }

    if (users.some(u => u.username.toLowerCase() === cleanName.toLowerCase())) {
        triggerValidationError('new-user-name', t('messages.name_taken'));
        return;
    }

    try {
        await storage.createFamilyMember(cleanName, cleanPass);
        const freshUsers = await storage.getUsers();
        onUpdateUsers(freshUsers);
        setNewUserName('');
        setNewUserPass('');
    } catch (e) {
        console.error(e);
        triggerValidationError('new-user', t('messages.failed_create'));
    }
  };

  const deleteUser = (id: string) => {
      onUpdateUsers(users.filter(u => u.id !== id));
  };

  const toggleAdmin = (id: string) => {
      onUpdateUsers(users.map(u => 
        u.id === id ? { ...u, isAdmin: !u.isAdmin, preferences: { ...u.preferences, isAdmin: !u.isAdmin } } : u
      ));
  };

  const updateFontSize = (scale: number) => {
      onUpdateUsers(users.map(u => 
        u.id === currentUser.id ? { ...u, fontSizeScale: scale } : u
      ), true);
  };

  const updatePreference = (key: 'showWeather' | 'showMoonPhases' | 'showHolidays', val: boolean) => {
      onUpdateUsers(users.map(u => 
          u.id === currentUser.id ? { ...u, preferences: { ...u.preferences!, [key]: val } } : u
      ), true);
  };
  
  const toggleTheme = () => {
      const currentTheme = currentUser.preferences?.theme || 'LIGHT';
      const newTheme = currentTheme === 'LIGHT' ? 'DARK' : 'LIGHT';
      onUpdateUsers(users.map(u => 
          u.id === currentUser.id ? { ...u, preferences: { ...u.preferences!, theme: newTheme } } : u
      ), true);
  };

  const handleUpdateUser = async (updatedUser: User) => {
      if (users.some(u => u.id !== updatedUser.id && u.username.toLowerCase() === updatedUser.username.trim().toLowerCase())) {
          triggerValidationError('edit-user-name', t('messages.name_taken'));
          return;
      }


      try {
        if (avatarFile) {
            // Case A: New File Selected -> Upload it
            const savedUser = await storage.uploadAvatar(updatedUser.id, avatarFile);
            updatedUser.photoUrl = savedUser.photoUrl;
        } 
        else if (!updatedUser.photoUrl) {
            // Case B: No photoUrl means it was removed in UI -> Delete from DB
            await storage.deleteAvatar(updatedUser.id);
        }
      } catch (e) {
        console.error("Avatar sync failed", e);
      }

      onUpdateUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
      setEditingUser(null);
      setAvatarFile(null);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!editingUser || !e.target.files?.[0]) return;
      const file = e.target.files[0];
      

      setAvatarFile(file);

      const reader = new FileReader();
      reader.onloadend = () => {
          setEditingUser({
              ...editingUser,
              photoUrl: reader.result as string
          });
      };
      reader.readAsDataURL(file);
  };

  const openChangePassword = (user: User) => {
      setPassModalUser(user);
      setPassOld('');
      setPassNew('');
      setPassError('');
      setPassSuccess('');
  }

  const handleSubmitPassword = async () => {
      if (!passModalUser || !passNew.trim()) return;
      if (passNew.length < 8) {
          setPassError(t('messages.pass_min_chars'));
          return;
      }
      
      const isSelf = passModalUser.id === currentUser.id;
      if (isSelf && !passOld) {
          setPassError(t('messages.current_pass_required'));
          return;
      }

      try {
          await storage.updateUserPassword(passModalUser.id, passNew, isSelf ? passOld : undefined);
          setPassSuccess(t('messages.pass_updated'));
          setPassError('');
          setTimeout(() => setPassModalUser(null), 1500); 
      } catch (e: any) {
          console.error(e);
          setPassError(t('messages.pass_update_fail'));
      }
  }

  const handleCitySearch = async () => {
      if(!cityQuery) return;
      setIsSearchingCity(true);
      const results = await searchCity(cityQuery);
      setCityResults(results);
      setIsSearchingCity(false);
  }

  const selectCity = (city: any) => {
      onUpdateSettings({
          ...settings,
          weatherEnabled: true,
          weatherLat: city.lat,
          weatherLon: city.lon,
          weatherLocationStr: `${city.name}, ${city.admin1 ? city.admin1 + ' ' : ''}${city.country}`
      });
      setCityResults([]);
      setCityQuery('');
  };

  const isStoreNameTaken = (name: string, excludeId?: string) => {
      return stores.some(s => s.name.toLowerCase() === name.toLowerCase() && s.id !== excludeId);
  }

  const addStore = () => {
      if (!newStoreName.trim()) return;
      if (isStoreNameTaken(newStoreName.trim())) {
          triggerValidationError('new-store', t('messages.name_taken'));
          return;
      }

      const newStore: ShoppingStore = {
          id: Date.now().toString(),
          name: newStoreName.trim(),
          order: stores.length
      };
      onUpdateStores([...stores, newStore]);
      setNewStoreName('');
  };

  const deleteStore = (id: string) => {
      onUpdateStores(stores.filter(s => s.id !== id));
      onUpdateCategories(categories.map(c => c.storeId === id ? { ...c, storeId: undefined } : c));
  };

  const saveStoreName = (id: string) => {
      if (!editStoreName.trim()) return;
      if (isStoreNameTaken(editStoreName.trim(), id)) {
          triggerValidationError(id, t('messages.name_taken'));
          return;
      }
      onUpdateStores(stores.map(s => s.id === id ? { ...s, name: editStoreName.trim() } : s));
      setEditingStoreId(null);
  };

  const handleStoreDragStart = (e: React.DragEvent, id: string) => {
      setDraggedStoreId(id);
      e.dataTransfer.effectAllowed = 'move';
  }

  const handleStoreDragOver = (e: React.DragEvent, id: string) => {
      e.preventDefault();
      if(id !== draggedStoreId) setDragOverStoreId(id);
  }

  const handleStoreDrop = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverStoreId(null);
      if(!draggedStoreId || draggedStoreId === targetId) return;

      const sorted = [...stores].sort((a,b) => a.order - b.order);
      const fromIdx = sorted.findIndex(s => s.id === draggedStoreId);
      const toIdx = sorted.findIndex(s => s.id === targetId);
      
      if(fromIdx === -1 || toIdx === -1) return;

      const [moved] = sorted.splice(fromIdx, 1);
      sorted.splice(toIdx, 0, moved);
      
      sorted.forEach((s, i) => s.order = i);
      onUpdateStores(sorted);
      setDraggedStoreId(null);
  }

  const isCatNameTaken = (name: string, storeId?: string, excludeId?: string) => {
      return categories.some(c => 
          c.name.toLowerCase() === name.toLowerCase() && 
          c.storeId === storeId && 
          c.id !== excludeId
      );
  }

  const addCategory = () => {
      if (!newCatName.trim()) return;
      const targetStoreId = newCatStoreId || (stores.length > 0 ? stores[0].id : undefined);

      if (isCatNameTaken(newCatName.trim(), targetStoreId)) {
          triggerValidationError('new-cat', t('messages.name_taken'));
          return;
      }

      const newCat: ShoppingCategory = {
          id: Date.now().toString(),
          name: newCatName,
          storeId: targetStoreId,
          order: categories.length
      };
      onUpdateCategories([...categories, newCat]);
      setNewCatName('');
  };

  const deleteCategory = (id: string) => {
      onUpdateCategories(categories.filter(c => c.id !== id));
      onUpdateShopping(shopping.map(i => i.categoryId === id ? { ...i, categoryId: undefined } : i));
  };

  const saveCatName = (id: string) => {
      if (!editCatName.trim()) return;
      if (isCatNameTaken(editCatName.trim(), editCatStoreId, id)) {
          triggerValidationError(id, t('messages.name_taken'));
          return;
      }
      onUpdateCategories(categories.map(c => c.id === id ? { ...c, name: editCatName, storeId: editCatStoreId } : c));
      setEditingCatId(null);
  };

  const handleCatDragStart = (e: React.DragEvent, id: string) => {
      setDraggedCatId(id);
      e.dataTransfer.effectAllowed = 'move';
  }

  const handleCatDragOver = (e: React.DragEvent, id: string) => {
      e.preventDefault();
      if(id !== draggedCatId) setDragOverCatId(id);
  }

  const handleCatDrop = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverCatId(null);
      if(!draggedCatId || draggedCatId === targetId) return;

      const sorted = [...categories].sort((a,b) => a.order - b.order);
      const fromIdx = sorted.findIndex(c => c.id === draggedCatId);
      const toIdx = sorted.findIndex(c => c.id === targetId);
      
      if(fromIdx === -1 || toIdx === -1) return;

      const [moved] = sorted.splice(fromIdx, 1);
      sorted.splice(toIdx, 0, moved);
      
      sorted.forEach((s, i) => s.order = i);
      onUpdateCategories(sorted);
      setDraggedCatId(null);
  }

  const handleDownloadBackup = async () => {
      const data = await storage.createBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = `${now.getHours()}-${now.getMinutes()}`;
      link.download = `familysync-backup-${dateStr}-${timeStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleRestoreClick = () => {
      // Clear previous status
      setBackupStatus(null);
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
          try {
              const content = ev.target?.result as string;
              const data = JSON.parse(content);
              await storage.restoreBackup(data);
              
              setBackupStatus({ type: 'success', msg: t('messages.backup_success') });
              setTimeout(() => {
                  window.location.reload();
              }, 2000); 
              
          } catch (err) {
              setBackupStatus({ type: 'error', msg: t('messages.backup_fail') });
              console.error(err);
          }
      };
      reader.readAsText(file);
  };

  const handleExportIcal = () => {
      // Filter events where current user is a participant
      const myEvents = events.filter(e => e.userIds.includes(currentUser.id));
      const icalString = generateICS(myEvents);
      const blob = new Blob([icalString], { type: 'text/calendar;charset=utf-8' });
      saveAs(blob, `familysync_${currentUser.username}.ics`);
  };

  const handleImportIcal = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      // Reset status
      setImportStatus(null);

      const reader = new FileReader();
      reader.onload = async (ev) => {
          try {
              const content = ev.target?.result as string;
              const parsedEvents = await parseICS(content);
              
              if (parsedEvents.length === 0) {
                  setImportStatus({ type: 'error', msg: t('settings.no_events_in_file') });
                  return;
              }

              // Import Logic
              // 1. Assign Current User
              // 2. Preserve icalUID for future sync potential
              const newEvents = parsedEvents.map(e => ({
                  ...e,
                  id: Date.now().toString() + Math.random(), // Temp ID
                  userIds: [currentUser.id]
              }));

              onUpdateEvents([...events, ...newEvents as CalendarEvent[]]);
              setImportStatus({ type: 'success', msg: t('settings.import_success', { count: newEvents.length }) });
              
              // Clear success message after 3 seconds
              setTimeout(() => setImportStatus(null), 3000);

          } catch (err) {
              console.error(err);
              setImportStatus({ type: 'error', msg: t('settings.import_error') });
          }
      };
      reader.readAsText(file);
  };

  const handleClickPrune = () => {
      // Clear previous status
      setPruneStatus(null);

      if (!pruneDate) {
          setPruneStatus({ type: 'error', msg: t('messages.select_date_first') });
          return;
      }
      const threshold = new Date(pruneDate).getTime();
      
      const keep = events.filter(e => {
          const start = new Date(e.startTime).getTime();
          if (start >= threshold) return true; 
          if (e.recurrence) {
              if (!e.recurrence.until) return true; 
              const until = new Date(e.recurrence.until).getTime();
              return until >= threshold;
          }
          return false; 
      });
      
      const deletedCount = events.length - keep.length;
      if (deletedCount === 0) {
          setPruneStatus({ type: 'error', msg: t('messages.prune_none', { date: pruneDate }) });
          return;
      }
      
      onUpdateEvents(keep);
      setPruneStatus({ type: 'success', msg: t('messages.prune_success', { count: deletedCount }) });
      setPruneDate('');
      
      // Clear success message after 5 seconds
      setTimeout(() => setPruneStatus(null), 5000);
  };

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900 flex flex-col relative">
      <style>{`
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
        }
        .animate-shake {
            animation: shake 0.3s ease-in-out;
        }
      `}</style>
      
      {passModalUser && (
          <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-xs overflow-hidden animate-in zoom-in-95">
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 border-b dark:border-gray-600 flex justify-between items-center">
                      <h3 className="font-bold text-gray-800 dark:text-white text-sm">
                          {passModalUser.id === currentUser.id ? t('settings.change_password_title') : t('settings.reset_password_title', { name: passModalUser.username })}
                      </h3>
                      <button onClick={() => setPassModalUser(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18}/></button>
                  </div>
                  <div className="p-4 space-y-3">
                      {passModalUser.id === currentUser.id && (
                          <div>
                              <label htmlFor="oldPass" className="block text-[0.6rem] font-bold text-gray-400 uppercase mb-1">{t('settings.current_password')}</label>
                              <input type="password" id="oldPass" name="oldPass" value={passOld} onChange={e => setPassOld(e.target.value)} className="w-full border dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-white"/>
                          </div>
                      )}
                      <div>
                          <label htmlFor="newPass" className="block text-[0.6rem] font-bold text-gray-400 uppercase mb-1">{t('settings.new_password_min')}</label>
                          <input 
                            type="password" 
                            id="newPass" 
                            name="newPass" 
                            value={passNew} 
                            onChange={e => setPassNew(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && handleSubmitPassword()}
                            className="w-full border dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-white"
                          />
                      </div>
                      {passError && <div className="text-xs text-red-500 font-bold flex items-center gap-1"><AlertTriangle size={10}/> {passError}</div>}
                      {passSuccess && <div className="text-xs text-green-600 font-bold flex items-center gap-1"><CheckCircle size={10}/> {passSuccess}</div>}
                  </div>
                  <div className="p-4 border-t dark:border-gray-600 flex justify-end">
                      <button onClick={handleSubmitPassword} disabled={!!passSuccess} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50">{t('settings.update_password')}</button>
                  </div>
              </div>
          </div>
      )}

      {editingUser && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600 p-4 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-gray-800 dark:text-white">{t('settings.edit_profile')}</h3>
                    <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    {/* Avatar Section */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-16 h-16 rounded-full bg-white dark:bg-gray-700 overflow-hidden border-4 border-white dark:border-gray-600 shadow-sm flex items-center justify-center text-3xl">
                                {editingUser.photoUrl ? <img src={editingUser.photoUrl} alt="Profile" className="w-full h-full object-cover" /> : editingUser.avatar}
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm mb-2">{t('settings.profile_picture')}</h4>
                                <div className="flex gap-2">
                                    <button 
                                        type="button" 
                                        onClick={() => avatarInputRef.current?.click()}
                                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <ImageIcon size={14} /> {t('settings.upload')}
                                    </button>
                                    {editingUser.photoUrl && (
                                        <button 
                                            type="button"
                                            onClick={() => setEditingUser({ ...editingUser, photoUrl: undefined })}
                                            className="text-red-500 text-xs font-bold hover:underline"
                                        >
                                            {t('settings.remove')}
                                        </button>
                                    )}
                                </div>
                                <input type="file" name="avatarUpload" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                            </div>
                        </div>
                        
                        <div className="pt-3 border-t border-blue-100 dark:border-blue-800">
                            <div className="flex items-center gap-2 mb-2">
                                <Smile size={14} className="text-blue-500" />
                                <span className="text-[0.625rem] font-bold text-blue-700 dark:text-blue-300 uppercase">{t('settings.choose_emoji')}</span>
                            </div>
                            <div className="grid grid-cols-5 gap-2">
                                {EMOJI_LIST.map(emoji => (
                                    <button 
                                        key={emoji}
                                        type="button"
                                        onClick={() => setEditingUser({ ...editingUser, avatar: emoji, photoUrl: undefined })}
                                        className={`text-xl p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors ${editingUser.avatar === emoji && !editingUser.photoUrl ? 'bg-blue-200 dark:bg-blue-900' : ''}`}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="relative">
                        <label htmlFor="editUsername" className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{t('settings.display_name')}</label>
                        <input type="text" id="editUsername" name="editUsername" value={editingUser.username} onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })} className={`w-full text-lg font-bold border-b-2 border-gray-200 dark:border-gray-600 focus:border-blue-500 outline-none py-1 text-gray-800 dark:text-white bg-transparent ${validationError?.id === 'edit-user-name' ? 'border-red-500 animate-shake' : ''}`}/>
                         {validationError?.id === 'edit-user-name' && (
                            <div className="absolute top-full left-0 mt-1 text-[0.6rem] text-red-500 font-bold flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded shadow-sm z-10">
                                <AlertTriangle size={8} /> {validationError.msg}
                            </div>
                        )}
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">{t('settings.color_badge')}</label>
                        <div className="grid grid-cols-5 gap-3">
                            {activePalette.map((hex, index) => {
                                const isUsed = users.some(u => u.colorIndex === index && u.id !== editingUser.id);
                                const isSelected = editingUser.colorIndex === index;
                                return (
                                    <button key={index} type="button" disabled={isUsed} onClick={() => setEditingUser({ ...editingUser, colorIndex: index })} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all relative ${isUsed ? 'opacity-20 cursor-not-allowed' : 'hover:scale-110 cursor-pointer'} ${isSelected ? 'ring-2 ring-offset-2 ring-gray-400 scale-110 shadow-md' : ''}`} style={{ backgroundColor: hex }}>
                                        {isSelected && <Check size={16} className="text-white drop-shadow-md" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-700 border-t dark:border-gray-600 flex justify-end shrink-0">
                    <button type="button" onClick={() => handleUpdateUser(editingUser)} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-transform">{t('item_modal.save_changes')}</button>
                </div>
            </div>
        </div>
      )}

      <div className="p-4 flex-1 overflow-y-auto space-y-6 pb-24 custom-scrollbar">

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 flex justify-between items-center">
                <h3 className="font-bold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">{t('settings.my_profile')}</h3>
                <div className="flex gap-2">
                    <button 
                        onClick={() => openChangePassword(currentUser)}
                        className="text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded flex items-center gap-1"
                    >
                        <Key size={12} /> {t('settings.change_password')}
                    </button>
                    <button 
                    type="button"
                    onClick={() => openEditUser(currentUser)}
                    className="text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded flex items-center gap-1"
                    >
                        <Edit2 size={12} /> {t('settings.edit')}
                    </button>
                </div>
            </div>
            <div className="p-4 flex items-center gap-4">
                 <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl border-4 dark:border-gray-700 overflow-hidden" style={{ borderColor: getColor(currentUser.colorIndex) }}>
                    {currentUser.photoUrl ? <img src={currentUser.photoUrl} alt={currentUser.username} className="w-full h-full object-cover"/> : currentUser.avatar}
                 </div>
                 <div>
                     <h2 className="text-xl font-bold text-gray-800 dark:text-white">{currentUser.username}</h2>
                     <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{t('settings.badge_color')}</span>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getColor(currentUser.colorIndex) }} />
                     </div>
                 </div>
            </div>
            
            <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => updatePreference('showWeather', !currentUser.preferences?.showWeather)}
                        className={`flex items-center justify-between p-2 rounded border text-xs font-bold ${currentUser.preferences?.showWeather !== false ? 'border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400' : 'border-gray-200 bg-white text-gray-400 dark:bg-gray-700 dark:border-gray-600'}`}
                    >
                        <span>{t('settings.weather')}</span>
                        {currentUser.preferences?.showWeather !== false ? <Check size={14}/> : <X size={14}/>}
                    </button>
                    <button 
                        onClick={() => updatePreference('showMoonPhases', !currentUser.preferences?.showMoonPhases)}
                        className={`flex items-center justify-between p-2 rounded border text-xs font-bold ${currentUser.preferences?.showMoonPhases !== false ? 'border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400' : 'border-gray-200 bg-white text-gray-400 dark:bg-gray-700 dark:border-gray-600'}`}
                    >
                        <span>{t('settings.moon_phases')}</span>
                        {currentUser.preferences?.showMoonPhases !== false ? <Check size={14}/> : <X size={14}/>}
                    </button>
                    <button 
                        onClick={() => updatePreference('showHolidays', !currentUser.preferences?.showHolidays)}
                        className={`flex items-center justify-between p-2 rounded border text-xs font-bold ${currentUser.preferences?.showHolidays !== false ? 'border-green-200 bg-green-50 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : 'border-gray-200 bg-white text-gray-400 dark:bg-gray-700 dark:border-gray-600'}`}
                    >
                        <span>{t('settings.holidays')}</span>
                        {currentUser.preferences?.showHolidays !== false ? <Check size={14}/> : <X size={14}/>}
                    </button>
                    <button 
                        onClick={toggleTheme}
                        className={`flex items-center justify-between p-2 rounded border text-xs font-bold ${currentUser.preferences?.theme === 'DARK' ? 'border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400' : 'border-gray-200 bg-white text-gray-400 dark:bg-gray-700 dark:border-gray-600'}`}
                    >
                        <span>{t('settings.dark_mode')}</span>
                        {currentUser.preferences?.theme === 'DARK' ? <Check size={14}/> : <X size={14}/>}
                    </button>
                </div>

                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Type size={16} className="text-gray-400"/>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('settings.zoom_level')}</span>
                    </div>
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 gap-1">
                        {[0.85, 1, 1.10, 1.25].map(scale => {
                            const isSelected = (currentUser.fontSizeScale || 1) === scale;
                            return (
                                <button
                                    key={scale}
                                    type="button"
                                    onClick={() => updateFontSize(scale)}
                                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${isSelected ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                                >
                                    {scale === 1 ? t('settings.normal') : `${Math.round(scale * 100)}%`}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>

        {currentUser.isAdmin && (
             <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 flex items-center gap-2">
                    <UserPlus size={16} className="text-gray-500 dark:text-gray-400"/>
                    <h3 className="font-bold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">{t('settings.family_members')}</h3>
                </div>
                <div className="p-4 space-y-4">
                    <div className="flex flex-col gap-2 mb-2 relative bg-gray-50 dark:bg-gray-700/30 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                        <label htmlFor="newUserName" className="text-[0.6rem] font-bold text-gray-400 uppercase">{t('settings.add_member')}</label>
                        <div className="flex gap-2 mb-4">
                            <div className="relative flex-1">
                                <input type="text" id="newUserName" name="newUserName" placeholder={t('auth.name_or_email')} value={newUserName} onChange={e => setNewUserName(e.target.value)} className={`w-full text-sm border rounded px-2 py-1 outline-none focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 ${validationError?.id === 'new-user-name' ? 'border-red-500 animate-shake' : ''}`}/>
                                {validationError?.id === 'new-user-name' && (
                                    <div className="absolute top-full left-0 mt-1 text-[0.6rem] text-red-500 font-bold flex items-center gap-1 animate-in slide-in-from-top-1">
                                        <AlertTriangle size={8} /> {validationError.msg}
                                    </div>
                                )}
                            </div>
                            <div className="relative w-1/3">
                                <Lock size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"/>
                                <input 
                                    type="password" 
                                    name="newUserPass" 
                                    placeholder={t('auth.password')} 
                                    value={newUserPass} 
                                    onChange={e => setNewUserPass(e.target.value)} 
                                    onKeyDown={e => e.key === 'Enter' && addUser()}
                                    className={`w-full text-sm border rounded pl-6 pr-2 py-1 outline-none focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 ${validationError?.id === 'new-user-pass' ? 'border-red-500 animate-shake' : ''}`}
                                />
                                {validationError?.id === 'new-user-pass' && (
                                    <div className="absolute top-full left-0 mt-1 text-[0.6rem] text-red-500 font-bold flex items-center gap-1 whitespace-nowrap animate-in slide-in-from-top-1">
                                        <AlertTriangle size={8} /> {validationError.msg}
                                    </div>
                                )}
                            </div>
                            <button onClick={addUser} disabled={!newUserName || !newUserPass} className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700 disabled:opacity-50 shadow-sm h-fit"><Plus size={16}/></button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {users.map(u => (
                            <div key={u.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 overflow-hidden" style={{ borderColor: getColor(u.colorIndex) }}>
                                        {u.photoUrl ? <img src={u.photoUrl} alt="" className="w-full h-full object-cover"/> : u.avatar}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{u.username}</div>
                                        {u.isAdmin && <div className="text-[0.6rem] text-blue-500 font-bold uppercase">{t('app.admin')}</div>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                     {u.id !== currentUser.id && (
                                         <>
                                            <button onClick={() => toggleAdmin(u.id)} className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 ${u.isAdmin ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20' : ''}`} title="Toggle Admin">
                                                {u.isAdmin ? <Shield size={16} className="fill-current"/> : <Shield size={16}/>}
                                            </button>
                                            <button onClick={() => openChangePassword(u)} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400" title="Reset Password">
                                                <Key size={16}/>
                                            </button>
                                         </>
                                     )}
                                     <button onClick={() => openEditUser(u)} className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-500"><Edit2 size={16}/></button>
                                     {u.id !== currentUser.id && (
                                         <button onClick={() => deleteUser(u.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                                     )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
        )}
        
        {currentUser.isAdmin && (
             <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 flex items-center gap-2">
                    <Store size={16} className="text-gray-500 dark:text-gray-400"/>
                    <h3 className="font-bold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">{t('settings.shopping_config')}</h3>
                </div>
                <div className="p-4 space-y-6">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label htmlFor="newStoreName" className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('settings.stores')}</label>
                        </div>
                        <div className="flex gap-2 mb-2 relative">
                            <input 
                                type="text" 
								id="newStoreName"
								name="newStoreName"
                                placeholder={t('settings.new_store')}
                                value={newStoreName} 
                                onChange={e => setNewStoreName(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && addStore()} 
                                className={`flex-1 text-sm border rounded px-2 py-1 outline-none focus:border-blue-500 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 ${validationError?.id === 'new-store' ? 'border-red-500 animate-shake' : ''}`}
                            />
                            <button onClick={addStore} disabled={!newStoreName} className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900 disabled:opacity-50"><Plus size={16}/></button>
                            {validationError?.id === 'new-store' && (
                                <div className="absolute top-full left-0 mt-1 text-[0.6rem] text-red-500 font-bold flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded shadow-sm z-10">
                                    <AlertTriangle size={8} /> {validationError.msg}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1">
                            {stores.sort((a,b) => a.order - b.order).map((s, idx) => {
                                const isEditing = editingStoreId === s.id;
                                const isDragTarget = dragOverStoreId === s.id;
                                const isError = validationError?.id === s.id;
                                return (
                                    <div 
                                        key={s.id} 
                                        draggable={!isEditing}
                                        onDragStart={(e) => handleStoreDragStart(e, s.id)}
                                        onDragOver={(e) => handleStoreDragOver(e, s.id)}
                                        onDrop={(e) => handleStoreDrop(e, s.id)}
                                        className={`flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-700/50 p-2 rounded border transition-colors relative ${isDragTarget ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-700'}`}
                                    >
                                        {!isEditing && <GripVertical size={14} className="text-gray-300 dark:text-gray-500 cursor-grab active:cursor-grabbing"/>}
                                        {isEditing ? (
                                            <>
                                                <input 
													name="editStoreName"
                                                    autoFocus
                                                    onFocus={(e) => e.target.select()}
                                                    value={editStoreName} 
                                                    onChange={e => setEditStoreName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && saveStoreName(s.id)}
                                                    className={`flex-1 bg-white dark:bg-gray-700 border rounded px-1 py-0.5 outline-none dark:text-white ${isError ? 'border-red-500 animate-shake' : 'border-blue-300'}`}
                                                />
                                                <button onClick={() => saveStoreName(s.id)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 p-1 rounded"><Check size={14}/></button>
                                                <button onClick={() => setEditingStoreId(null)} className="text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 p-1 rounded"><X size={14}/></button>
                                                {isError && (
                                                    <div className="absolute bottom-full left-0 mb-1 text-[0.6rem] text-white bg-red-500 font-bold px-2 py-0.5 rounded shadow-sm z-10">
                                                       {validationError.msg}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <span className="font-bold text-gray-700 dark:text-gray-200 flex-1">{s.name}</span>
                                                <button onClick={() => { setEditingStoreId(s.id); setEditStoreName(s.name); }} className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"><Edit2 size={12}/></button>
                                                <button onClick={() => deleteStore(s.id)} className="text-gray-400 hover:text-red-500 ml-2"><Trash2 size={14}/></button>
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    
                    <div>
                        <label htmlFor="newCatName" className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 block">{t('settings.categories')}</label>
                        <div className="flex gap-2 mb-2 relative">
                             <input 
                                type="text" 
                                id="newCatName" 
                                name="newCatName" 
                                placeholder={t('settings.category_name')} 
                                value={newCatName} 
                                onChange={e => setNewCatName(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && addCategory()} 
                                className={`flex-1 min-w-0 text-sm border dark:border-gray-600 rounded px-2 py-1 outline-none focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 ${validationError?.id === 'new-cat' ? 'border-red-500 animate-shake' : ''}`}
                             />
                             <select name="newCatStoreSelect" value={newCatStoreId} onChange={e => setNewCatStoreId(e.target.value)} className="text-sm border dark:border-gray-600 rounded px-2 py-1 outline-none max-w-[100px] sm:max-w-[120px] bg-white dark:bg-gray-700 dark:text-white truncate">
                                 {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                             </select>
                             <button onClick={addCategory} disabled={!newCatName} className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900 disabled:opacity-50 shrink-0"><Plus size={16}/></button>
                             {validationError?.id === 'new-cat' && (
                                <div className="absolute top-full left-0 mt-1 text-[0.6rem] text-red-500 font-bold flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded shadow-sm z-10">
                                    <AlertTriangle size={8} /> {validationError.msg}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1">
                            {categories.sort((a,b) => a.order - b.order).map((c, idx) => {
                                const isEditing = editingCatId === c.id;
                                const isDragTarget = dragOverCatId === c.id;
                                return (
                                    <div 
                                        key={c.id} 
                                        draggable={!isEditing}
                                        onDragStart={(e) => handleCatDragStart(e, c.id)}
                                        onDragOver={(e) => handleCatDragOver(e, c.id)}
                                        onDrop={(e) => handleCatDrop(e, c.id)}
                                        className={`flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-700/50 p-2 rounded border transition-colors ${isDragTarget ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-700'}`}
                                    >
                                        {!isEditing && <GripVertical size={14} className="text-gray-300 dark:text-gray-500 cursor-grab active:cursor-grabbing"/>}
                                        {isEditing ? (
                                            <>
                                                <input 
                                                    autoFocus
													name="editCatName"
                                                    onFocus={(e) => e.target.select()}
                                                    value={editCatName}
                                                    onChange={e => setEditCatName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && saveCatName(c.id)}
                                                    className="flex-1 bg-white dark:bg-gray-700 border border-blue-300 rounded px-1 py-0.5 outline-none min-w-0 dark:text-white"
                                                />
                                                <select 
													name="editCatStoreSelect"
                                                    value={editCatStoreId} 
                                                    onChange={e => setEditCatStoreId(e.target.value)} 
                                                    className="text-xs border rounded px-1 py-0.5 outline-none max-w-[80px] bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600"
                                                >
                                                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                                <button onClick={() => saveCatName(c.id)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 p-1 rounded"><Check size={14}/></button>
                                                <button onClick={() => setEditingCatId(null)} className="text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 p-1 rounded"><X size={14}/></button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex flex-col flex-1 leading-none min-w-0">
                                                    <span className="font-bold text-gray-700 dark:text-gray-200 truncate">{c.name}</span>
                                                    <span className="text-[0.6rem] text-gray-400 truncate">{stores.find(s => s.id === c.storeId)?.name || t('settings.unknown_store')}</span>
                                                </div>
                                                <button onClick={() => { setEditingCatId(c.id); setEditCatName(c.name); setEditCatStoreId(c.storeId || ''); }} className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"><Edit2 size={12}/></button>
                                                <button onClick={() => deleteCategory(c.id)} className="text-gray-400 hover:text-red-500 ml-2"><Trash2 size={14}/></button>
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
             </div>
        )}

        {currentUser.isAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                 <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 flex items-center gap-2">
                    <Calendar size={16} className="text-gray-500 dark:text-gray-400"/>
                    <h3 className="font-bold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">{t('settings.calendar_config')}</h3>
                </div>
                <div className="p-4 space-y-4">
                    {/* Import / Export Section */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                        <label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-3 block">Import / Export</label>
                        <div className="flex gap-3">
                            <button onClick={handleExportIcal} className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-lg py-2 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 shadow-sm transition-all active:scale-95">
                                <FileDown size={16} /> Export .ics
                            </button>
                            <button onClick={() => icalInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white border border-transparent rounded-lg py-2 text-xs font-bold hover:bg-blue-700 shadow-sm transition-all active:scale-95">
                                <FileUp size={16} /> Import .ics
                            </button>
                            <input type="file" ref={icalInputRef} onChange={handleImportIcal} accept=".ics" className="hidden" />
                        </div>
                        
                        {importStatus ? (
                            <div className={`mt-3 text-xs font-bold flex items-center justify-center gap-2 px-2 py-1.5 rounded ${importStatus.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                {importStatus.type === 'success' ? <CheckCircle size={14}/> : <AlertTriangle size={14}/>}
                                {importStatus.msg}
                            </div>
                        ) : (
                            <p className="text-[0.6rem] text-blue-600/70 dark:text-blue-400/70 mt-2 text-center">
                                Imports will be converted to your local time and assigned to you.
                            </p>
                        )}
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                        <label htmlFor="holidayCountry" className="text-xs font-bold text-gray-400 uppercase mb-3 block">{t('settings.region')}</label>
                        <div className="space-y-3">
                            <select 
								id="holidayCountry"
								name="holidayCountry"
                                className="w-full text-sm border-gray-300 dark:border-gray-600 rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white border outline-none focus:ring-1 focus:ring-blue-500"
                                value={settings.holidayCountryCode}
                                onChange={(e) => onUpdateSettings({...settings, holidayCountryCode: e.target.value, holidaySubdivisionCode: ''})}
                            >
                                {countries.map(c => (
                                    <option key={c.key} value={c.key}>
                                        {/* Try to translate country name, fallback to API English name */}
                                        {new Intl.DisplayNames([currentUser.preferences?.language || 'en'], { type: 'region' }).of(c.key) || c.value}
                                    </option>
                                ))}
                            </select>
                            
                            {loadingSubdivisions ? (
                                <div className="text-xs text-gray-400 italic">{t('messages.loading_regions')}</div>
                            ) : (subdivisions.length > 0 && (
                                <select
									name="holidaySubdivision"
                                    className="w-full text-sm border-gray-300 dark:border-gray-600 rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white border outline-none focus:ring-1 focus:ring-blue-500"
                                    value={settings.holidaySubdivisionCode || ''}
                                    onChange={(e) => onUpdateSettings({...settings, holidaySubdivisionCode: e.target.value})}
                                >
                                    <option value="">{t('settings.national_only')}</option>
                                    {subdivisions.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            ))}
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-2">
                                <CloudSun size={16} className="text-blue-500"/>
                                <label htmlFor="citySearch" className="text-xs font-bold text-gray-400 uppercase">{t('settings.weather_location')}</label>
                             </div>
                             {settings.weatherEnabled && (
                                 <span className="text-[0.625rem] text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">{t('settings.active')}</span>
                             )}
                        </div>
                        
                        <div className="flex flex-col gap-2">
                             {settings.weatherEnabled && settings.weatherLocationStr && (
                                <div className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border dark:border-gray-600 px-2 py-1 rounded flex items-center justify-between">
                                    <span className="flex items-center gap-1"><MapPin size={10} /> {settings.weatherLocationStr}</span>
                                    <span className="text-[0.6rem] text-gray-400">({settings.weatherLat?.toFixed(2)}, {settings.weatherLon?.toFixed(2)})</span>
                                </div>
                             )}

                             <div className="flex gap-1 mt-1 relative">
                                <input 
									id="citySearch"
									name="citySearch"
                                    type="text" 
                                    placeholder={t('settings.city_placeholder')}
                                    className="text-xs p-2 rounded border dark:border-gray-600 flex-1 outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                                    value={cityQuery}
                                    onChange={(e) => setCityQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCitySearch()}
                                />
                                <button 
                                    onClick={handleCitySearch}
                                    disabled={isSearchingCity || !cityQuery}
                                    className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                    <Search size={14} />
                                </button>
                             </div>
                             
                             {cityResults.length > 0 && (
                                <div className="mt-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded shadow-sm max-h-40 overflow-y-auto animate-in slide-in-from-top-1">
                                    {cityResults.map((city, idx) => (
                                        <button 
                                            key={idx} 
                                            onClick={() => selectCity(city)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0 text-gray-800 dark:text-gray-200"
                                        >
                                            <span className="font-bold">{city.name}</span> <span className="text-gray-500">{city.admin1}, {city.country}</span>
                                        </button>
                                    ))}
                                </div>
                             )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {currentUser.isAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                        <Palette size={16} className="text-gray-500 dark:text-gray-400"/>
                        <h3 className="font-bold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">{t('settings.family_color_palette')}</h3>
                    </div>
                    <div className="group relative">
                        <HelpCircle size={16} className="text-gray-400 cursor-help" />
                        <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                            {t('settings.family_color_desc')}
                        </div>
                    </div>
                </div>
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        {Object.keys(PALETTES).map((key) => {
                            const pKey = key as PaletteKey;
                            const isActive = paletteKey === pKey;
                            const previewColors = PALETTES[pKey].slice(0, 5);
                            return (
                                <button key={key} type="button" onClick={() => onUpdatePaletteKey(pKey)} className={`p-3 rounded-lg border-2 text-left transition-all ${isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                                    <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 capitalize">{t(`settings.palette_${key.toLowerCase()}`)}</div>
                                    <div className="flex gap-1">{previewColors.map(c => <div key={c} className="w-3 h-3 rounded-full" style={{background: c}} />)}</div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        )}
        
        {currentUser.isAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 flex items-center gap-2">
                    <Database size={16} className="text-gray-500 dark:text-gray-400"/>
                    <h3 className="font-bold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">{t('settings.data_management')}</h3>
                </div>
                <div className="p-4 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <button type="button" onClick={handleDownloadBackup} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-100 dark:border-blue-800 transition-colors">
                                <Download size={24} />
                                <span className="text-xs font-bold uppercase">{t('settings.backup')}</span>
                            </button>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                            <button type="button" onClick={handleRestoreClick} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors">
                                <Upload size={24} />
                                <span className="text-xs font-bold uppercase">{t('settings.restore')}</span>
                            </button>
                            <input type="file" name="restoreFile" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange}/>
                        </div>
                    </div>

                    {backupStatus && (
                        <div className={`text-xs font-bold flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${backupStatus.type === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400'}`}>
                            {backupStatus.type === 'success' ? <CheckCircle size={14}/> : <AlertTriangle size={14}/>}
                            {backupStatus.msg}
                        </div>
                    )}

                    <div className="border-t dark:border-gray-700 pt-4">
                        <label htmlFor="pruneDate" className="block text-xs font-bold text-red-500 uppercase tracking-wide mb-2">{t('settings.bulk_delete')}</label>
                        <div className="flex gap-2">
                            <div className="relative group flex-1">
                                <DatePicker 
                                    id="pruneDate"
                                    name="pruneDate"
                                    selected={pruneDate ? new Date(pruneDate) : null}
                                    onChange={(date: Date) => setPruneDate(date ? date.toISOString() : '')}
                                    placeholderText={t('settings.select_threshold')}
                                    dateFormat={t('formats.date_picker')}
                                    className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white flex items-center h-10 border-transparent focus:border-blue-300 dark:focus:border-blue-700 outline-none cursor-pointer"
                                    portalId="root"
                                    locale={currentUser.preferences?.language?.split('-')[0] || 'en'}
                                    showMonthDropdown
                                    showYearDropdown
                                    dropdownMode="select"
                                />
                            </div>
                            <button type="button" onClick={handleClickPrune} disabled={!pruneDate} className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg font-bold text-xs hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform">{t('settings.prune')}</button>
                        </div>
                        {pruneStatus && (
                            <div className={`mt-2 text-xs font-bold flex items-center gap-2 px-2 ${pruneStatus.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                {pruneStatus.type === 'success' ? <CheckCircle size={12}/> : <AlertTriangle size={12}/>}
                                {pruneStatus.msg}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Settings;