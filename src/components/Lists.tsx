import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ShoppingItem, TodoItem, ShoppingCategory, PriorityLevel, ShoppingStore, ShoppingLogEntry, ShoppingLogType, User } from '../types';
import { Check, Trash2, Plus, ShoppingCart, CheckSquare, GripVertical, AlertCircle, ArrowDown, Lock, MoreHorizontal, History, Tag, X, ShoppingBag, Store, Save, Clock, User as UserIcon, Eye, Calendar, CalendarClock } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';

interface ListsProps {
  shoppingList: ShoppingItem[];
  todos: TodoItem[];
  stores: ShoppingStore[];
  categories: ShoppingCategory[];
  onUpdateShopping: (items: ShoppingItem[], skipHistory?: boolean) => void;
  onUpdateTodos: (items: TodoItem[], skipHistory?: boolean) => void;
  currentTab: 'shopping' | 'todos';
  onTabChange: (tab: 'shopping' | 'todos') => void;
}

const getAutocompleteHistory = (): string[] => {
    try {
        const stored = localStorage.getItem('fs_shopping_history');
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
};

const Lists: React.FC<ListsProps> = ({ 
    shoppingList, todos, stores, categories, onUpdateShopping, onUpdateTodos, currentTab, onTabChange 
}) => {
  const { users, currentUser } = useUser();
  const { activePalette, getUserColor } = useTheme();
  
  const [newItemText, setNewItemText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<string[]>(getAutocompleteHistory);
  
  const [selectedItem, setSelectedItem] = useState<ShoppingItem | null>(null); 
  const [editFormData, setEditFormData] = useState<ShoppingItem | null>(null); 

  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null);
  const [todoFormData, setTodoFormData] = useState<Partial<TodoItem>>({});

  const [hideEmpty, setHideEmpty] = useState(false);
  
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null); 
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null); 
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | null>(null); 
  
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  // Helper to detect temporary IDs (optimistic items)
  const isSaving = (id: string) => id.length > 15;

  useEffect(() => {
      localStorage.setItem('fs_shopping_history', JSON.stringify(historyItems));
  }, [historyItems]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (inputWrapperRef.current && !inputWrapperRef.current.contains(event.target as Node)) {
              setShowHistory(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedItem) {
        setEditFormData({ ...selectedItem });
        if (selectedItem.seenByUserIds && currentUser && !selectedItem.seenByUserIds.includes(currentUser.id)) {
             const updated = shoppingList.map(i => i.id === selectedItem.id ? { ...i, seenByUserIds: [...(i.seenByUserIds || []), currentUser.id] } : i);
             onUpdateShopping(updated, true);
        }
    } else {
        setEditFormData(null);
    }
  }, [selectedItem, currentUser]);

  useEffect(() => {
      if (selectedTodo) {
          setTodoFormData({ ...selectedTodo });
      } else {
          setTodoFormData({});
      }
  }, [selectedTodo]);

  if (!currentUser) return null;

  const getUsername = (uid: string) => {
      return users.find(u => u.id === uid)?.username || 'Unknown';
  };

  const getMyPriority = (item: ShoppingItem): PriorityLevel => {
      return item.userPriorities?.[currentUser.id] || 'NORMAL';
  }
  
  const getMyCategoryId = (item: ShoppingItem): string | undefined => {
      return item.userCategoryIds?.[currentUser.id];
  }

  const formatRelativeTime = (isoString: string) => {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      if (diffDays === 0 && date.getDate() === now.getDate()) {
          return `Today at ${timeStr}`;
      } else if (diffDays === 1 || (diffDays === 0 && date.getDate() !== now.getDate())) {
          return `Yesterday at ${timeStr}`;
      } else {
          return `${date.toLocaleDateString()} at ${timeStr}`;
      }
  };

  const createLog = (type: ShoppingLogType, details?: string): ShoppingLogEntry => ({
      id: Date.now().toString() + Math.random(),
      type,
      userId: currentUser.id,
      timestamp: new Date().toISOString(),
      details
  });

  // --- CHANGED: Removed Regex Parsing ---
  const parseInput = (text: string) => {
      // Logic barrier removed. Input is now always raw text.
      // Users can set Priority or Privacy via the Edit Modal after creation.
      return { 
          content: text.trim(), 
          priority: 'NORMAL' as PriorityLevel, 
          isPrivate: false 
      };
  };

  const getSuggestedCategory = (itemName: string) => {
      const match = shoppingList.find(i => i.content.toLowerCase() === itemName.toLowerCase() && i.creatorCategoryId);
      return match ? match.creatorCategoryId : undefined;
  };

  const addShoppingItem = (overrideText?: string) => {
      const raw = overrideText || newItemText;
      if (!raw.trim()) return;

      const { content, priority, isPrivate } = parseInput(raw);
      
      if (!historyItems.includes(content)) {
          setHistoryItems(prev => [content, ...prev].slice(0, 50));
      }

      const smartCatId = getSuggestedCategory(content);

      const item: ShoppingItem = {
          id: Date.now().toString() + Math.random(),
          content,
          isInCart: false,
          addedByUserId: currentUser.id,
          addedAt: new Date().toISOString(),
          isPrivate,
          note: '',
          
          userCategoryIds: smartCatId ? { [currentUser.id]: smartCatId } : {},
          userPriorities: priority !== 'NORMAL' ? { [currentUser.id]: priority } : {},
          seenByUserIds: [currentUser.id], 
          creatorCategoryId: smartCatId,
          logs: [createLog('CREATE', `Added item "${content}"`)]
      };

      onUpdateShopping([...shoppingList, item]); 
      setNewItemText('');
      setShowHistory(false);
  };

  const toggleShopItem = (id: string) => {
    const updated = shoppingList.map(i => {
        if (i.id === id) {
            const nextState = !i.isInCart;
            const seen = i.seenByUserIds || [];
            const nextSeen = seen.includes(currentUser.id) ? seen : [...seen, currentUser.id];
            
            const logEntry = createLog(nextState ? 'COMPLETE' : 'RESTORE', nextState ? 'Marked as bought' : 'Restored to list');
            
            return { 
                ...i, 
                isInCart: nextState,
                completedByUserId: nextState ? currentUser.id : undefined,
                completedAt: nextState ? new Date().toISOString() : undefined,
                seenByUserIds: nextSeen,
                logs: [logEntry, ...(i.logs || [])]
            };
        }
        return i;
    });
    onUpdateShopping(updated, true); 
  };

  const acceptSuggestion = (item: ShoppingItem) => {
      if (!item.creatorCategoryId) return;
      
      const updated = shoppingList.map(i => {
          if (i.id === item.id) {
               const cats = i.userCategoryIds || {};
               const seen = i.seenByUserIds || [];
               const nextSeen = seen.includes(currentUser.id) ? seen : [...seen, currentUser.id];

               return {
                   ...i,
                   userCategoryIds: { ...cats, [currentUser.id]: item.creatorCategoryId! },
                   seenByUserIds: nextSeen
               };
          }
          return i;
      });
      onUpdateShopping(updated);
  }

  const deleteShopItem = (id: string) => {
      onUpdateShopping(shoppingList.filter(i => i.id !== id));
      setSelectedItem(null);
  };

  const saveEditForm = () => {
      if (!editFormData || !selectedItem) return;
      if (!editFormData.content.trim()) return;

      const updatedItems = shoppingList.map(i => {
          if (i.id === selectedItem.id) {
              const newLogs = [...(i.logs || [])];
              
              if (i.content !== editFormData.content) {
                  newLogs.unshift(createLog('UPDATE', `Renamed from "${i.content}" to "${editFormData.content}"`));
              }

              const oldPrio = getMyPriority(i);
              const newPrio = (editFormData as any).priority || oldPrio;
              if (oldPrio !== newPrio) {
                  newLogs.unshift(createLog('UPDATE', `Changed priority to ${newPrio}`));
              }

              const base = {
                  ...i,
                  content: editFormData.content,
                  note: editFormData.note,
                  isPrivate: editFormData.isPrivate,
                  logs: newLogs
              };
              
              const prios = { ...(i.userPriorities || {}) };
              if (newPrio) prios[currentUser.id] = newPrio;

              return { ...base, userPriorities: prios };
          }
          return i;
      });

      onUpdateShopping(updatedItems);
      setSelectedItem(null);
  };

  const clearCart = () => {
    onUpdateShopping(shoppingList.filter(i => !i.isInCart));
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
      setDraggedItemId(id);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); 
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnCategory = (e: React.DragEvent, catId: string | undefined) => {
      e.preventDefault();
      setDragOverTargetId(null);
      setDragOverCatId(null);
      setDragOverPosition(null);
      if (!draggedItemId) return;

      const item = shoppingList.find(i => i.id === draggedItemId);
      if (item) {
           const cats = item.userCategoryIds || {};
           let newCats = { ...cats };
           if (catId) {
               newCats[currentUser.id] = catId;
           } else {
               delete newCats[currentUser.id];
           }
           
           let creatorCat = item.creatorCategoryId;
           if (item.addedByUserId === currentUser.id || !creatorCat) {
               creatorCat = catId;
           }

           const seen = item.seenByUserIds || [];
           const nextSeen = seen.includes(currentUser.id) ? seen : [...seen, currentUser.id];

           const updated = shoppingList.map(i => i.id === draggedItemId ? { ...i, userCategoryIds: newCats, creatorCategoryId: creatorCat, seenByUserIds: nextSeen } : i);
           onUpdateShopping(updated);
      }
      setDraggedItemId(null);
  };

  const handleItemDragEnter = (e: React.DragEvent, itemId: string) => {
      if(itemId === draggedItemId) return;
      setDragOverTargetId(itemId);
  }

  const handleItemDragOver = (e: React.DragEvent, itemId: string) => {
      if (itemId === draggedItemId) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (e.clientY < midpoint) setDragOverPosition('top');
      else setDragOverPosition('bottom');
  }

  const handleCatDragEnter = (e: React.DragEvent, catId: string | undefined) => {
      if (!draggedItemId) return;
      setDragOverCatId(catId || 'uncat');
  }

  const handleDropOnItem = (e: React.DragEvent, targetItemId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTargetId(null);
      setDragOverCatId(null);
      setDragOverPosition(null);
      
      if (!draggedItemId || draggedItemId === targetItemId) return;

      const targetItem = shoppingList.find(i => i.id === targetItemId);
      if (!targetItem) return;
      
      const targetCatId = getMyCategoryId(targetItem);
      handleDropOnCategory(e, targetCatId);
  };

  const handleDragEnd = () => {
      setDraggedItemId(null);
      setDragOverTargetId(null);
      setDragOverCatId(null);
      setDragOverPosition(null);
  }

  const sortedStores = useMemo(() => [...stores].sort((a,b) => a.order - b.order), [stores]);
  const sortedCategories = useMemo(() => [...categories].sort((a,b) => a.order - b.order), [categories]);

  const renderGroups = useMemo(() => {
      const visibleItems = shoppingList.filter(i => !i.isPrivate || i.addedByUserId === currentUser.id);
      const itemsByCategory: { [catId: string]: ShoppingItem[] } = {};
      const uncategorizedItems: ShoppingItem[] = [];

      visibleItems.forEach(item => {
          const myCatId = getMyCategoryId(item);
          if (myCatId) {
              if (!itemsByCategory[myCatId]) itemsByCategory[myCatId] = [];
              itemsByCategory[myCatId].push(item);
          } else {
              uncategorizedItems.push(item);
          }
      });

      const tree: any[] = [];

      sortedStores.forEach(store => {
          const storeCats = sortedCategories.filter(c => c.storeId === store.id);
          const catsWithItems = storeCats.map(cat => ({
              ...cat,
              items: itemsByCategory[cat.id] || []
          }));

          const finalCats = hideEmpty ? catsWithItems.filter(c => c.items.length > 0) : catsWithItems;

          if (!hideEmpty || finalCats.length > 0) {
              tree.push({ type: 'STORE', data: store, children: finalCats });
          }
      });

      const orphanCats = sortedCategories.filter(c => !c.storeId || !stores.find(s => s.id === c.storeId));
      const orphanCatsWithItems = orphanCats.map(cat => ({
          ...cat,
          items: itemsByCategory[cat.id] || []
      }));
      
      const finalOrphans = hideEmpty ? orphanCatsWithItems.filter(c => c.items.length > 0) : orphanCatsWithItems;

      if (finalOrphans.length > 0) {
          tree.push({ type: 'ORPHAN_CATS', children: finalOrphans });
      }

      if (uncategorizedItems.length > 0) {
          tree.push({ type: 'UNCATEGORIZED', items: uncategorizedItems });
      }

      return tree;
  }, [shoppingList, sortedStores, sortedCategories, currentUser.id, hideEmpty]);

  const myTodos = useMemo(() => {
    const mine = todos.filter(t => t.userId === currentUser.id);
    
    const prioScore = (p?: PriorityLevel) => {
        if (p === 'URGENT') return 0;
        if (p === 'NORMAL' || !p) return 1;
        return 2;
    };

    return mine.sort((a, b) => {
        const pa = prioScore(a.priority);
        const pb = prioScore(b.priority);
        if (pa !== pb) return pa - pb;

        if (a.deadline && b.deadline) {
            return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        }
        if (a.deadline && !b.deadline) return -1; 
        if (!a.deadline && b.deadline) return 1;

        return a.content.localeCompare(b.content);
    });
  }, [todos, currentUser.id]);

  const toggleTodo = (id: string) => {
      onUpdateTodos(todos.map(i => i.id === id ? { ...i, isCompleted: !i.isCompleted } : i), true);
  };
  
  const deleteTodo = (id: string) => {
      onUpdateTodos(todos.filter(i => i.id !== id));
      setSelectedTodo(null);
  };
  
  const addTodo = () => {
      if(!newItemText.trim()) return;
      const { content, priority, isPrivate } = parseInput(newItemText);
      onUpdateTodos([...todos, { 
          id: Date.now().toString(), 
          content, 
          isCompleted: false, 
          userId: currentUser.id, 
          priority, 
          isPrivate 
      }]);
      setNewItemText('');
  };

  const saveTodoEdit = () => {
      if (!selectedTodo || !todoFormData.content?.trim()) return;
      const updated = todos.map(t => t.id === selectedTodo.id ? { 
          ...t, 
          content: todoFormData.content!, 
          deadline: todoFormData.deadline,
          note: todoFormData.note,
          priority: todoFormData.priority 
      } : t);
      onUpdateTodos(updated);
      setSelectedTodo(null);
  };

  const clearCompletedTodos = () => {
      const keep = todos.filter(t => !(t.userId === currentUser.id && t.isCompleted));
      onUpdateTodos(keep);
  };
  
  const getTodoDateValue = (isoString?: string) => {
      if (!isoString) return '';
      const date = new Date(isoString);
      const y = date.getFullYear();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const d = date.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${d}`;
  };

  const getTodoDisplayDate = (isoString?: string) => {
      if (!isoString) return 'No Deadline';
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  };

  const setTodoDate = (dateStr: string) => {
      if (!dateStr) {
          setTodoFormData({ ...todoFormData, deadline: undefined });
          return;
      }
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      setTodoFormData({ ...todoFormData, deadline: date.toISOString() });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 relative overflow-hidden">
      
      {/* Shopping Detail View Modal */}
      {selectedItem && editFormData && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
              <div 
                  className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col h-full sm:h-auto sm:max-h-[90vh]" 
                  onClick={e => e.stopPropagation()}
              >
                  {/* Header */}
                  <div className="flex justify-between items-center p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 sticky top-0 z-10 shrink-0">
                      <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide">Edit Item</h3>
                      <button onClick={() => setSelectedItem(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400"><X size={20}/></button>
                  </div>

                  {/* Body */}
                  <div className="p-5 flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-1">
                      {/* Name */}
                      <div>
                          <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Item Name</label>
                          <input 
                              type="text" 
							  name="editShopItemName"
                              value={editFormData.content} 
                              onChange={(e) => setEditFormData({ ...editFormData, content: e.target.value })}
                              className="w-full text-2xl font-bold border-b-2 border-gray-100 dark:border-gray-700 focus:border-blue-500 outline-none py-2 text-gray-800 dark:text-gray-100 bg-transparent placeholder-gray-300 dark:placeholder-gray-600"
                              autoFocus
                          />
                      </div>

                      {/* Note */}
                      <div>
                          <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Note</label>
                          <textarea 
                              rows={3}
							  name="editShopItemNote"
                              value={editFormData.note || ''}
                              onChange={(e) => setEditFormData({ ...editFormData, note: e.target.value })}
                              className="w-full bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-sm focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800 outline-none resize-none dark:text-white dark:placeholder-gray-500"
                          />
                      </div>

                      {/* My Priority */}
                      <div>
                        <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-2 block">My Priority</label>
                        <div className="flex gap-2">
                          {(['URGENT', 'NORMAL', 'LOW'] as PriorityLevel[]).map(p => {
                              const currentPrio = (editFormData as any).priority || getMyPriority(selectedItem);
                              const isSelected = currentPrio === p;
                              return (
                                  <button 
                                    key={p}
                                    onClick={() => setEditFormData({ ...editFormData, priority: p } as any)}
                                    className={`flex-1 py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}
                                  >
                                      {p === 'URGENT' && <AlertCircle size={12} />}
                                      {p === 'LOW' && <ArrowDown size={12} />}
                                      {p}
                                  </button>
                              )
                          })}
                        </div>
                      </div>

                      {/* Audit Log */}
                      <div className="border-t dark:border-gray-700 pt-4">
                          <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Activity History</label>
                          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 border border-gray-100 dark:border-gray-700 space-y-3 max-h-40 overflow-y-auto custom-scrollbar">
                              {(selectedItem.logs || []).map(log => {
                                  const u = users.find(u => u.id === log.userId);
                                  const color = u ? activePalette[u.colorIndex % activePalette.length] : '#ccc';
                                  return (
                                      <div key={log.id} className="flex gap-3 items-start">
                                          <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{backgroundColor: color}}></div>
                                          <div>
                                              <p className="text-xs text-gray-700 dark:text-gray-300">
                                                  <span className="font-bold">{u?.username || 'Unknown'}</span>: {log.details}
                                              </p>
                                              <p className="text-[0.65rem] text-gray-400 dark:text-gray-500">{formatRelativeTime(log.timestamp)}</p>
                                          </div>
                                      </div>
                                  )
                              })}
                              {(!selectedItem.logs || selectedItem.logs.length === 0) && (
                                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                      <Plus size={12} className="text-gray-400" />
                                      <span>Added by <b>{getUsername(selectedItem.addedByUserId)}</b></span>
                                      <span className="text-gray-400 dark:text-gray-500">{new Date(selectedItem.addedAt).toLocaleDateString()}</span>
                                  </div>
                              )}
                          </div>
                      </div>

                  </div>
                  
                  {/* Footer */}
                  <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex gap-3 sticky bottom-0 z-10 shrink-0">
                      <button onClick={() => deleteShopItem(editFormData.id)} className="p-3 text-red-500 dark:text-red-400 font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={20} /></button>
                      <button onClick={saveEditForm} className="flex-1 py-3 text-white font-bold bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2"><Save size={18} /> Save Changes</button>
                  </div>
              </div>
          </div>
      )}

      {/* Todo Edit Modal */}
      {selectedTodo && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedTodo(null)}>
              <div 
                  className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col h-full sm:h-auto sm:max-h-[90vh]" 
                  onClick={e => e.stopPropagation()}
              >
                  {/* Header */}
                  <div className="flex justify-between items-center p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 sticky top-0 z-10 shrink-0">
                      <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide">Edit Task</h3>
                      <button onClick={() => setSelectedTodo(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400"><X size={20}/></button>
                  </div>
                  
                  <div className="p-5 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">
                      {/* Name */}
                      <div>
                          <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Task Name</label>
                          <input 
                              type="text" 
							  name="editTodoContent"
                              value={todoFormData.content || ''} 
                              onChange={(e) => setTodoFormData({ ...todoFormData, content: e.target.value })}
                              className="w-full text-2xl font-bold border-b-2 border-gray-100 dark:border-gray-700 focus:border-blue-500 outline-none py-2 text-gray-800 dark:text-gray-100 bg-transparent placeholder-gray-300 dark:placeholder-gray-600"
                              autoFocus
                          />
                      </div>
                      
                      {/* Deadline */}
                      <div>
                          <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Due Date</label>
                          <div className="relative group">
                               {/* VISIBLE MASK */}
                               <div className="bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center px-3 py-2 gap-2 h-10 border border-transparent group-hover:border-blue-300 dark:group-hover:border-blue-700 transition-colors">
                                  <CalendarClock size={16} className="text-gray-500 dark:text-gray-400 shrink-0"/>
                                  <span className={`text-sm font-medium truncate ${!todoFormData.deadline ? 'text-gray-400 italic' : 'text-gray-800 dark:text-white'}`}>
                                      {getTodoDisplayDate(todoFormData.deadline)}
                                  </span>
                               </div>

                               {/* INVISIBLE TRIGGER */}
                               <input 
                                   type="date"
								   name="editTodoDeadline"
                                   value={getTodoDateValue(todoFormData.deadline)}
                                   onChange={(e) => setTodoDate(e.target.value)}
                                   onClick={(e) => e.currentTarget.showPicker()}
                                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 top-6"
                               />
                               {todoFormData.deadline && (
                                   <button onClick={(e) => { e.stopPropagation(); setTodoDate(''); }} className="absolute right-2 bottom-2.5 z-20 p-0.5 bg-gray-200 dark:bg-gray-600 rounded-full text-gray-500 hover:text-red-500" title="Clear Date"><X size={12} /></button>
                               )}
                          </div>
                      </div>

                      {/* Priority */}
                      <div>
                        <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Priority</label>
                        <div className="flex gap-2">
                          {(['URGENT', 'NORMAL', 'LOW'] as PriorityLevel[]).map(p => {
                              const isSelected = (todoFormData.priority || 'NORMAL') === p;
                              return (
                                  <button 
                                    key={p}
                                    onClick={() => setTodoFormData({ ...todoFormData, priority: p })}
                                    className={`flex-1 py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}
                                  >
                                      {p === 'URGENT' && <AlertCircle size={12} />}
                                      {p === 'LOW' && <ArrowDown size={12} />}
                                      {p}
                                  </button>
                              )
                          })}
                        </div>
                      </div>

                      {/* Note */}
                      <div>
                          <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Note</label>
                          <textarea 
                              rows={3}
							  name="editTodoNote"
                              value={todoFormData.note || ''}
                              onChange={(e) => setTodoFormData({ ...todoFormData, note: e.target.value })}
                              className="w-full bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-sm focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800 outline-none resize-none dark:text-white dark:placeholder-gray-500"
                              placeholder="Add details..."
                          />
                      </div>
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex gap-3 sticky bottom-0 z-10 shrink-0">
                      <button onClick={() => deleteTodo(selectedTodo.id)} className="p-3 text-red-500 dark:text-red-400 font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={20} /></button>
                      <button onClick={saveTodoEdit} className="flex-1 py-3 text-white font-bold bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2"><Save size={18} /> Save Changes</button>
                  </div>
              </div>
          </div>
      )}

      {/* Tabs */}
      <div className="flex bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button onClick={() => onTabChange('shopping')} className={`flex-1 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${currentTab === 'shopping' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
          <ShoppingCart size={16} /> Shopping
        </button>
        <button onClick={() => onTabChange('todos')} className={`flex-1 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${currentTab === 'todos' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
          <CheckSquare size={16} /> To-Do
        </button>
      </div>

      {/* Controls */}
      {currentTab === 'shopping' && (
          <div className="bg-white dark:bg-gray-800 p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
              <div className="text-xs font-bold text-gray-500 dark:text-gray-400">
                  {shoppingList.filter(i => !i.isInCart).length} items remaining
              </div>
              <button 
                onClick={() => setHideEmpty(!hideEmpty)} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${hideEmpty ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
              >
                  {hideEmpty ? <Eye size={14} /> : <Eye size={14} className="text-gray-400" />}
                  {hideEmpty ? 'Show All' : 'Hide Empty'}
              </button>
          </div>
      )}

      {/* Input */}
      <div className="p-3 bg-white dark:bg-gray-800 shadow-sm shrink-0 z-20">
        <div className="flex gap-2 relative" ref={inputWrapperRef}>
          <input 
            type="text" 
			name="listNewItemInput"
            value={newItemText}
            onChange={(e) => { setNewItemText(e.target.value); setShowHistory(true); }}
            onFocus={() => setShowHistory(true)}
            onKeyDown={(e) => e.key === 'Enter' && (currentTab === 'shopping' ? addShoppingItem() : addTodo())}
            placeholder={currentTab === 'shopping' ? "Add item" : "Add task"}
            className="flex-1 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg px-4 text-sm focus:ring-2 focus:ring-blue-500 dark:text-white"
          />
          <button onClick={() => currentTab === 'shopping' ? addShoppingItem() : addTodo()} className="bg-blue-600 text-white px-3 sm:px-4 rounded-lg hover:bg-blue-700 active:scale-95 transition-transform"><Plus size={20} /></button>
          
          {/* History Dropdown */}
          {currentTab === 'shopping' && showHistory && (newItemText || historyItems.length > 0) && (
              <div className="absolute top-full left-0 right-12 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 max-h-48 overflow-y-auto z-50">
                  {historyItems.filter(h => h.toLowerCase().includes(newItemText.toLowerCase())).map(h => (
                      <button key={h} onClick={() => addShoppingItem(h)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between group text-gray-700 dark:text-gray-200">
                          <span className="font-medium">{h}</span>
                          <History size={12} className="text-gray-300 group-hover:text-blue-400"/>
                      </button>
                  ))}
              </div>
          )}
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-6 pb-20 custom-scrollbar relative">
        {currentTab === 'shopping' && (
            <>
                {renderGroups.map((node, idx) => {
                    if (node.type === 'STORE') {
                        return (
                            <div key={node.data.id} className="space-y-2">
                                <div className="flex items-center gap-2 mb-1">
                                    <Store size={16} className="text-gray-800 dark:text-gray-200" />
                                    <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">{node.data.name}</h2>
                                    <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                                </div>
                                {node.children.map((cat: any) => (
                                    <CategoryBlock 
                                        key={cat.id} 
                                        category={cat} 
                                        items={cat.items} 
                                        {...{handleDragStart, handleDragEnd, handleDragOver, handleDropOnCategory, handleDropOnItem, handleItemDragEnter, handleItemDragOver, handleCatDragEnter, dragOverCatId, dragOverTargetId, dragOverPosition, toggleShopItem, setSelectedItem, getUserColor, currentUser, getMyPriority, categories, acceptSuggestion, stores}} 
                                    />
                                ))}
                            </div>
                        );
                    } else if (node.type === 'ORPHAN_CATS') {
                        return (
                            <div key="orphans" className="space-y-2">
                                 {node.children.map((cat: any) => (
                                    <CategoryBlock 
                                        key={cat.id} 
                                        category={cat} 
                                        items={cat.items} 
                                        {...{handleDragStart, handleDragEnd, handleDragOver, handleDropOnCategory, handleDropOnItem, handleItemDragEnter, handleItemDragOver, handleCatDragEnter, dragOverCatId, dragOverTargetId, dragOverPosition, toggleShopItem, setSelectedItem, getUserColor, currentUser, getMyPriority, categories, acceptSuggestion, stores}} 
                                    />
                                ))}
                            </div>
                        );
                    } else if (node.type === 'UNCATEGORIZED') {
                         return (
                            <div key="uncat" className="space-y-2 pt-2"
                                onDragOver={handleDragOver}
                                onDragEnter={(e) => handleCatDragEnter(e, undefined)}
                                onDrop={(e) => handleDropOnCategory(e, undefined)}
                            >
                                <div className="flex items-center gap-2 px-1">
                                    <Tag size={12} className="text-gray-300 dark:text-gray-600"/>
                                    <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Uncategorized</h3>
                                    <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                                </div>
                                <div className={`space-y-1 p-2 rounded-lg transition-colors ${dragOverCatId === 'uncat' ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700' : ''}`}>
                                    {node.items.map((item: ShoppingItem) => (
                                        <ShoppingItemRow 
                                            key={item.id} 
                                            item={item} 
                                            {...{handleDragStart, handleDragEnd, handleDropOnItem, handleItemDragEnter, handleItemDragOver, dragOverTargetId, dragOverPosition, toggleShopItem, setSelectedItem, getUserColor, currentUser, getMyPriority, categories, acceptSuggestion, stores}}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    }
                    return null;
                })}
                
                {shoppingList.length === 0 && (
                    <div className="text-center text-gray-400 dark:text-gray-600 mt-10 flex flex-col items-center">
                        <ShoppingBag size={48} className="opacity-20 mb-2"/>
                        <p>List is empty</p>
                    </div>
                )}
            </>
        )}
        
        {currentTab === 'todos' && (
             <div className="space-y-2">
                {myTodos.length === 0 && <div className="text-center text-gray-400 dark:text-gray-600 mt-10">Nothing to do!</div>}
                {myTodos.map(item => {
                    const saving = isSaving(item.id);
                    return (
                        <div 
                            key={item.id} 
                            onClick={() => !saving && setSelectedTodo(item)}
                            className={`flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 transition-colors 
                                ${saving ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700'} 
                                ${item.isCompleted ? 'opacity-50' : ''}`} 
                            style={{ borderLeftColor: getUserColor(users.find(u => u.id === item.userId)) }}
                        >
                            <button 
                                onClick={(e) => { e.stopPropagation(); toggleTodo(item.id); }} 
                                disabled={saving}
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors 
                                    ${item.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600 text-transparent hover:border-green-500'}
                                    ${saving ? 'cursor-not-allowed opacity-50' : ''}`}
                            >
                                {saving ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"/> : <Check size={14} strokeWidth={3} />}
                            </button>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    {item.priority === 'URGENT' && <AlertCircle size={14} className="text-red-500 fill-red-50 dark:fill-red-900/20 shrink-0" />}
                                    {item.priority === 'LOW' && <ArrowDown size={14} className="text-blue-400 shrink-0" />}
                                    
                                    <span className={`block font-medium truncate leading-tight ${item.isCompleted ? 'line-through text-gray-500' : 'text-gray-800 dark:text-gray-200'} ${saving ? 'italic text-gray-400' : ''}`}>
                                        {item.content} {saving && "(Saving...)"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    {item.deadline && (
                                        <div className={`flex items-center gap-1 text-xs font-bold ${item.priority === 'URGENT' ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                            <CalendarClock size={12} />
                                            <span>Due: {new Date(item.deadline).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                    {item.note && (
                                        <div className="text-[0.65rem] text-gray-400 dark:text-gray-500 truncate max-w-[150px]">
                                            {item.note}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
             </div>
        )}
      </div>
      
      {currentTab === 'shopping' && shoppingList.some(i => i.isInCart) && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 animate-in slide-in-from-bottom-5 w-auto">
              <button onClick={clearCart} className="px-6 py-3 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 flex items-center justify-center gap-2 shadow-xl shadow-red-200 dark:shadow-red-900/20 active:scale-95 transition-all whitespace-nowrap">
                  <Trash2 size={16} /> Clear Checked Items
              </button>
          </div>
      )}

      {currentTab === 'todos' && myTodos.some(t => t.isCompleted) && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 animate-in slide-in-from-bottom-5 w-auto">
              <button onClick={clearCompletedTodos} className="px-6 py-3 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 flex items-center justify-center gap-2 shadow-xl shadow-red-200 dark:shadow-red-900/20 active:scale-95 transition-all whitespace-nowrap">
                  <Trash2 size={16} /> Clear Completed Tasks
              </button>
          </div>
      )}
    </div>
  );
};

// Sub-Components
const CategoryBlock = ({ category, items, handleDragOver, handleDropOnCategory, handleCatDragEnter, dragOverCatId, ...props }: any) => {
    const isDragTarget = dragOverCatId === category.id;
    return (
        <div 
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleCatDragEnter(e, category.id)}
            onDrop={(e) => handleDropOnCategory(e, category.id)}
            className={`pl-2 border-l-2 border-gray-100 dark:border-gray-700 space-y-1 min-h-[30px] rounded-r-lg transition-colors ${isDragTarget ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
        >
            <h3 className={`text-xs font-bold uppercase tracking-wider pl-1 ${isDragTarget ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{category.name}</h3>
            <div className="space-y-1">
                {items.map((item: ShoppingItem) => (
                    <ShoppingItemRow key={item.id} item={item} {...props} />
                ))}
            </div>
            {items.length === 0 && (
                <div className={`h-8 border border-dashed rounded flex items-center justify-center text-[0.6rem] transition-colors ${isDragTarget ? 'border-blue-400 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold' : 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600'}`}>
                    {isDragTarget ? 'Drop to add to category' : 'Drop items here'}
                </div>
            )}
        </div>
    )
}

const ShoppingItemRow = ({ 
    item, currentUser, getUserColor, toggleShopItem, setSelectedItem, 
    handleDragStart, handleDragEnd, handleDropOnItem, handleItemDragEnter, handleItemDragOver, dragOverTargetId, dragOverPosition,
    getMyPriority, categories, acceptSuggestion, stores
}: any) => {
    const isDragTarget = dragOverTargetId === item.id;
    const myPriority = getMyPriority(item);
    const isNew = !item.seenByUserIds?.includes(currentUser.id) && item.addedByUserId !== currentUser.id;
    const suggestionCatId = item.creatorCategoryId;
    const showSuggestion = suggestionCatId && !item.userCategoryIds?.[currentUser.id];
    
    let suggestionText = null;
    if (showSuggestion) {
        const cat = categories.find((c: any) => c.id === suggestionCatId);
        if (cat) {
            const storeName = stores.find((s: any) => s.id === cat.storeId)?.name;
            suggestionText = `${cat.name} ${storeName ? `(${storeName})` : ''}`;
        }
    }

    // Check if saving (temp ID)
    const saving = item.id.length > 15;

    return (
        <div 
            draggable={!saving} 
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleItemDragOver(e, item.id)}
            onDragEnter={(e) => handleItemDragEnter(e, item.id)}
            onDrop={(e) => handleDropOnItem(e, item.id)}
            className={`
                flex items-center gap-2 p-2 sm:p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 group relative overflow-hidden transition-all 
                ${saving ? 'opacity-70' : 'cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-gray-700'}
                ${isDragTarget && dragOverPosition === 'top' ? 'border-t-2 border-t-blue-500 rounded-t-none mt-1' : ''}
                ${isDragTarget && dragOverPosition === 'bottom' ? 'border-b-2 border-b-blue-500 rounded-b-none mb-1' : ''}
                ${!isDragTarget ? 'my-0' : ''}
            `}
            style={{ borderLeftColor: getUserColor(item.addedByUserId) }}
        >
            <div className={`flex items-center gap-2 flex-1 min-w-0 ${item.isInCart ? 'opacity-40 grayscale' : ''}`}>
                <div className={`text-gray-300 dark:text-gray-600 shrink-0 ${saving ? '' : 'cursor-grab hover:text-gray-500 dark:hover:text-gray-400'}`}>
                    <GripVertical size={16} />
                </div>

                <button 
                    onClick={(e) => { e.stopPropagation(); toggleShopItem(item.id); }}
                    disabled={saving}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors 
                        ${item.isInCart ? 'bg-gray-500 border-gray-500 text-white' : 'border-gray-300 dark:border-gray-600 text-transparent hover:border-blue-500 dark:hover:border-blue-400'}
                        ${saving ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                    {saving ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"/> : <Check size={14} strokeWidth={3} />}
                </button>

                <div className="flex-1 min-w-0 cursor-pointer flex flex-col justify-center" onClick={() => !saving && setSelectedItem(item)}>
                    <div className="flex items-center gap-1.5">
                        {isNew && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" title="New Item"></span>}
                        {myPriority === 'URGENT' && <AlertCircle size={14} className="text-red-500 fill-red-50 dark:fill-red-900/20 shrink-0 animate-pulse" />}
                        {myPriority === 'LOW' && <ArrowDown size={14} className="text-blue-400 shrink-0" />}
                        {item.isPrivate && <Lock size={12} className="text-gray-400 shrink-0" />}
                        
                        <span className={`text-sm font-bold truncate leading-tight ${item.isInCart ? 'line-through text-gray-500 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'} ${saving ? 'italic text-gray-400' : ''}`}>
                            {item.content} {saving && "(Saving...)"}
                        </span>
                    </div>
                    {suggestionText && (
                        <button 
                           onClick={(e) => { e.stopPropagation(); acceptSuggestion(item); }}
                           className="text-[0.6rem] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded self-start mt-1 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                        >
                            Suggested: {suggestionText}
                        </button>
                    )}
                    {item.note && (
                        <div className="text-[0.65rem] text-gray-400 dark:text-gray-500 truncate mt-0.5 font-medium">
                            {item.note}
                        </div>
                    )}
                </div>
            </div>

            <button 
                onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }} 
                disabled={saving}
                className={`p-1 text-gray-300 dark:text-gray-600 z-10 ${saving ? 'hidden' : 'hover:text-blue-500 dark:hover:text-blue-400'}`}
            >
                <MoreHorizontal size={16} />
            </button>
        </div>
    )
}

export default Lists;