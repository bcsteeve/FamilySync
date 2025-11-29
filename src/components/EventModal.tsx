
import React, { useState, useEffect, useMemo } from 'react';
import { CalendarEvent, User, RecurrenceFreq } from '../types';
import { toLocalDateString } from '../constants';
import { X, Trash2, Save, Calendar as CalIcon, List, Keyboard, Repeat, Check, Infinity as InfinityIcon, AlertCircle, RefreshCw, Info, Undo } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';

interface EventModalProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
  initialDate?: Date; // For creating new events OR referencing specific instance clicked
}

const EventModal: React.FC<EventModalProps> = ({ 
  event, isOpen, onClose, onSave, onDelete, initialDate 
}) => {
  const { users, currentUser } = useUser();
  const { activePalette, getUserColor } = useTheme();
  const [formData, setFormData] = useState<Partial<CalendarEvent>>({});
  const [deleteStage, setDeleteStage] = useState<'IDLE' | 'SERIES_CHOICE'>('IDLE');
  const [manualTimeMode, setManualTimeMode] = useState(false);
  const [showRecurrence, setShowRecurrence] = useState(false);

  // Hook: Check if we are compliant with React Rules (must be top level)
  // Sort Exdates Chronologically - Moved to top to prevent conditional hook error
  const sortedExdates = useMemo(() => {
      if (!formData.exdates) return [];
      return [...formData.exdates].sort((a, b) => a.localeCompare(b));
  }, [formData.exdates]);

  // Generate 15-min time slots for dropdown
  const timeSlots = useMemo(() => {
    const slots = [];
    // 00:00 to 23:45
    for (let i = 0; i < 96; i++) {
        const totalMins = i * 15;
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        
        const hStr = h.toString().padStart(2, '0');
        const mStr = m.toString().padStart(2, '0');
        const val = `${hStr}:${mStr}`;
        
        // Format: 05:00 PM (Leading zero, Uppercase AM/PM)
        const h12 = h % 12 || 12;
        const h12Str = h12.toString().padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        const label = `${h12Str}:${mStr} ${ampm}`;
        
        slots.push({ value: val, label });
    }
    return slots;
  }, []);

  useEffect(() => {
    if (isOpen) {
      setDeleteStage('IDLE'); 
      setManualTimeMode(false); 
      
      if (event) {
        // LOGIC CHANGE:
        // If Recurring: Load the SERIES START (Anchor), not the instance date.
        // If Single: Load the INSTANCE date (allows moving single events easily).
        
        if (event.recurrence) {
             setFormData({ 
                ...event,
                startTime: event.startTime // Always the Series Anchor
            });
        } else {
             // Use initialDate if provided (the slot clicked), otherwise existing start time
             const start = initialDate ? new Date(initialDate) : new Date(event.startTime);
             setFormData({ 
                ...event,
                startTime: start.toISOString()
            });
        }
        setShowRecurrence(!!event.recurrence);
      } else {
        // New Event
        const start = initialDate ? new Date(initialDate) : new Date();
        start.setHours(9, 0, 0, 0); 
        
        setFormData({
          title: '',
          description: '',
          startTime: start.toISOString(),
          userIds: [currentUser.id],
          isAllDay: false
        });
        setShowRecurrence(false);
      }
    }
  }, [isOpen, event, initialDate, currentUser.id]);

  if (!isOpen) return null;

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!formData.title?.trim() || !formData.startTime) {
        return;
    }
    
    // Clean up recurrence data
    let recurrence = formData.recurrence;
    if (!showRecurrence) {
        recurrence = undefined;
    }

    let finalStart = formData.startTime;
    let finalEnd = formData.endTime;

    // Ensure end time exists or is adjusted if needed
    if (!finalEnd) {
        finalEnd = new Date(new Date(finalStart).getTime() + 3600000).toISOString();
    } else {
        // If we moved the start time, we should preserve the DURATION of the event
        const originalDuration = (event && event.endTime && event.startTime) 
            ? new Date(event.endTime).getTime() - new Date(event.startTime).getTime()
            : 3600000;
            
        finalEnd = new Date(new Date(finalStart).getTime() + originalDuration).toISOString();
    }

    // Standardize All Day events to Midnight Local
    if (formData.isAllDay) {
        const d = new Date(finalStart);
        d.setHours(0,0,0,0);
        finalStart = d.toISOString();
        
        const e = new Date(finalEnd || finalStart);
        e.setHours(0,0,0,0);
        finalEnd = e.toISOString();
    }

    const newEvent: CalendarEvent = {
      id: event?.id || Date.now().toString(),
      title: formData.title,
      description: formData.description || '',
      startTime: finalStart,
      endTime: finalEnd,
      userIds: formData.userIds || [],
      isAllDay: !!formData.isAllDay,
      recurrence,
      exdates: formData.exdates // Preserve existing exdates
    };

    // Dirty Check: If the object is identical to the original, skip save to avoid phantom history
    if (event) {
        // Create clean copies for comparison
        const originalClean = JSON.stringify({ ...event, id: '' }); // Ignore ID match in case weirdness
        const newClean = JSON.stringify({ ...newEvent, id: '' });
        
        if (originalClean === newClean) {
            onClose();
            return;
        }
    }

    onSave(newEvent);
    onClose();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!event || !event.id) return;

      if (formData.recurrence) {
          setDeleteStage('SERIES_CHOICE');
      } else {
          onDelete(event.id);
      }
  };

  const handleConfirmDeleteSeries = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (event?.id) onDelete(event.id);
  };

  const handleDeleteInstance = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!event) return;
      
      // Delete the SPECIFIC INSTANCE that was clicked (initialDate), 
      // even if the form is currently showing the Series Start Date.
      const targetDate = initialDate ? initialDate : new Date(formData.startTime!);
      const instanceDateStr = toLocalDateString(targetDate);
      
      const currentExdates = event.exdates || [];
      const updatedExdates = [...currentExdates, instanceDateStr];
      
      onSave({
          ...event,
          exdates: updatedExdates
      });
      onClose();
  };

  const handleRestoreInstance = (dateStr: string) => {
      const currentExdates = formData.exdates || [];
      const updatedExdates = currentExdates.filter(d => d !== dateStr);
      setFormData({
          ...formData,
          exdates: updatedExdates
      });
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleteStage('IDLE');
  }

  // Helper to safely get YYYY-MM-DD from an ISO string by respecting local time construction
  const getDateInputValue = (isoString?: string) => {
      if (!isoString) return '';
      const date = new Date(isoString);
      const y = date.getFullYear();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const d = date.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${d}`;
  }

  const getDisplayDate = (isoString?: string) => {
      if (!isoString) return 'Select Date';
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  }

  const getTimeInputValue = (isoString?: string) => {
      if (!isoString) return '';
      const date = new Date(isoString);
      const h = date.getHours().toString().padStart(2, '0');
      const m = date.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
  }

  const updateDateTime = (type: 'date' | 'time', value: string) => {
      const current = new Date(formData.startTime || new Date());
      if (type === 'date') {
          // Parse YYYY-MM-DD manually to avoid UTC shifts
          const [y, m, d] = value.split('-').map(Number);
          current.setFullYear(y);
          current.setMonth(m - 1);
          current.setDate(d);
      } else {
          const [h, min] = value.split(':').map(Number);
          current.setHours(h);
          current.setMinutes(min);
      }
      setFormData({ ...formData, startTime: current.toISOString() });
  };

  const toggleUser = (userId: string) => {
      const currentIds = formData.userIds || [];
      if (currentIds.includes(userId)) {
          setFormData({ ...formData, userIds: currentIds.filter(id => id !== userId) });
      } else {
          setFormData({ ...formData, userIds: [...currentIds, userId] });
      }
  };

  // --- Recurrence Logic ---

  // Suggest a default date based on 3x the frequency period
  const getSuggestedUntilDate = (freq: RecurrenceFreq, startDateIso: string): string => {
      const d = new Date(startDateIso);
      if (freq === 'DAILY') d.setDate(d.getDate() + 3);
      else if (freq === 'WEEKLY') d.setDate(d.getDate() + 21); // 3 weeks
      else if (freq === 'MONTHLY') d.setMonth(d.getMonth() + 3);
      else if (freq === 'YEARLY') d.setFullYear(d.getFullYear() + 3);
      return d.toISOString();
  }

  const updateRecurrence = (field: string, val: any) => {
      const currentRecurrence = formData.recurrence || { freq: 'WEEKLY' };
      
      let newRecurrence = { ...currentRecurrence, [field]: val };
      
      // If Frequency changed, auto-update the 'Until' date to a smart default (3x period)
      if (field === 'freq' && formData.startTime) {
          const smartUntil = getSuggestedUntilDate(val as RecurrenceFreq, formData.startTime);
          newRecurrence.until = smartUntil;
      }

      setFormData({ 
          ...formData, 
          recurrence: newRecurrence
      });
  };

  const handleUntilChange = (dateStr: string) => {
      if (!dateStr) {
          // Empty string from date input means invalid or cleared.
          updateRecurrence('until', ''); 
          return;
      }
      // Construct Local Midnight Date -> ISO
      const [y, m, d] = dateStr.split('-').map(Number);
      const localDate = new Date(y, m - 1, d);
      updateRecurrence('until', localDate.toISOString());
  }

  const setUntilForever = () => {
      updateRecurrence('until', undefined);
  }

  const setUntilToday = () => {
      const today = new Date();
      // Reset to midnight local
      today.setHours(0,0,0,0);
      updateRecurrence('until', today.toISOString());
  }

  const handleRecurrenceToggle = () => {
    const nextState = !showRecurrence;
    setShowRecurrence(nextState);
    if(nextState && !formData.recurrence) {
        // Initialize with default Weekly, 3 weeks out
        const start = formData.startTime || new Date().toISOString();
        const smartUntil = getSuggestedUntilDate('WEEKLY', start);
        
        setFormData({
            ...formData, 
            recurrence: { 
                freq: 'WEEKLY',
                until: smartUntil
            } 
        });
    }
  };

  // Time Input Logic
  const currentTimeValue = getTimeInputValue(formData.startTime);
  const isStandardTime = timeSlots.some(s => s.value === currentTimeValue);
  const showManualInput = manualTimeMode || (!isStandardTime && currentTimeValue !== '');
  
  const toggleTimeMode = () => {
      if (manualTimeMode) {
          // Switching FROM Manual TO List
          // Round to nearest 15 minutes
          const date = new Date(formData.startTime || new Date());
          const m = date.getMinutes();
          const remainder = m % 15;
          
          if (remainder !== 0) {
              const roundedM = Math.round(m / 15) * 15;
              date.setMinutes(roundedM);
              date.setSeconds(0);
              setFormData({ ...formData, startTime: date.toISOString() });
          }
          setManualTimeMode(false);
      } else {
          setManualTimeMode(true);
      }
  };

  // Validation
  const hasTitle = !!formData.title?.trim();
  
  // Recurrence Validation
  // If showing recurrence, 'until' must either be undefined (Forever) OR a valid date >= start
  let isRecurrenceValid = true;
  if (showRecurrence && formData.recurrence?.until) {
      // If 'until' is an empty string (cleared by picker but not set to undefined), it's invalid
      if (formData.recurrence.until === '') {
          isRecurrenceValid = false;
      } else {
          const untilTime = new Date(formData.recurrence.until).getTime();
          // Small buffer for same-day math
          const startTime = new Date(formData.startTime!).getTime() - 1000; 
          if (isNaN(untilTime) || untilTime < startTime) {
              isRecurrenceValid = false;
          }
      }
  }

  // If until is EXPLICITLY empty string (from input clear), it is invalid. 
  // Undefined means "Forever" which is valid.
  if (showRecurrence && formData.recurrence?.until === '') {
      isRecurrenceValid = false;
  }

  const isValid = hasTitle && isRecurrenceValid;

  // Display Helpers
  const isRecurring = !!event?.recurrence || showRecurrence;
  const displayDateLabel = isRecurring ? "Series Start Date" : "Date";
  
  const instanceDateDisplay = (event && event.recurrence && initialDate) 
    ? initialDate.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
            className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 sticky top-0 z-10 shrink-0">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                {event ? (isRecurring ? 'Edit Series' : 'Edit Event') : 'New Event'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400">
                <X size={20} />
            </button>
            </div>

            {/* Recurrence Banner */}
            {event && event.recurrence && (
                <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2 flex flex-col gap-1 border-b border-blue-100 dark:border-blue-800">
                    <div className="flex items-start gap-2">
                        <RefreshCw size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-800 dark:text-blue-300 font-bold">Editing Series</p>
                    </div>
                    <p className="text-[0.6rem] text-blue-700 dark:text-blue-400 leading-tight pl-6">
                        Changes apply to all repeats. Use "Delete This Instance" to remove a single occurrence.
                    </p>
                </div>
            )}

            {/* Selected Instance Helper */}
            {instanceDateDisplay && (
                <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-600">
                    <Info size={14} className="text-gray-500 dark:text-gray-400" />
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                        Selected Instance: <span className="font-bold text-gray-800 dark:text-white">{instanceDateDisplay}</span>
                    </p>
                </div>
            )}

            {/* Body */}
            <div className="p-5 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
            
            {/* Title Input */}
            <div>
                <input 
                type="text" 
                name="eventTitle"
                id="eventTitle"
                value={formData.title || ''}
                onChange={e => setFormData({...formData, title: e.target.value})}
                className="w-full text-2xl font-bold border-b-2 border-gray-100 dark:border-gray-700 focus:border-blue-500 outline-none py-2 bg-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors dark:text-white"
                placeholder="Title..."
                autoFocus
                />
            </div>

            {/* Date & Time */}
            <div className="flex gap-4">
                <div className="flex-1 relative group">
                    <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">{displayDateLabel}</label>
                    
                    {/* VISIBLE MASK */}
                   <div className="bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center px-3 py-2 gap-2 h-10 border border-transparent group-hover:border-blue-300 dark:group-hover:border-blue-700 transition-colors">
                        <CalIcon size={16} className="text-gray-500 dark:text-gray-400 shrink-0"/>
                       <span className="text-sm font-medium text-gray-800 dark:text-white truncate">
                            {getDisplayDate(formData.startTime)}
                        </span>
                    </div>

                    {/* INVISIBLE TRIGGER */}
                    <input 
                        type="date"
                        name="eventStartDate"
                        id="eventStartDate"
                        value={getDateInputValue(formData.startTime)}
                        onChange={(e) => { if(e.target.value) updateDateTime('date', e.target.value); }}
                        onClick={(e) => e.currentTarget.showPicker()}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 top-6"
                    />
                </div>                
                <div className={`w-5/12 transition-opacity duration-200 ${formData.isAllDay ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                     <div className="flex justify-between items-baseline mb-1">
                        <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider block">Time</label>
                        {!formData.isAllDay && (
                            <button 
                                onClick={toggleTimeMode}
                                className="text-[0.625rem] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider hover:text-blue-800 flex items-center gap-1"
                            >
                                {showManualInput ? <List size={10} /> : <Keyboard size={10} />}
                                {showManualInput ? 'List' : 'Type'}
                            </button>
                        )}
                    </div>
                    
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center px-3 py-2 gap-2 h-10 relative group">
                        {showManualInput ? (
                            <input 
                                type="time"
								name="eventTimeManual"
                                value={currentTimeValue}
                                onChange={(e) => updateDateTime('time', e.target.value)}
                                className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0 w-full outline-none [&::-webkit-calendar-picker-indicator]:hidden dark:text-white"
                                autoFocus={manualTimeMode}
                            />
                        ) : (
                            <select
                                value={currentTimeValue}
								name="eventTimeSelect"
                                onChange={(e) => updateDateTime('time', e.target.value)}
                                className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0 w-full outline-none appearance-none truncate dark:text-white"
                            >
                                {timeSlots.map(s => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>
                        )}
                        {!showManualInput && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 dark:text-gray-400">
                                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* All Day Toggle Checkbox */}
            <div className="flex items-center gap-2">
                 <label className="flex items-center gap-2 cursor-pointer select-none">
                     <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.isAllDay ? 'bg-blue-600 border-blue-600' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'}`}>
                         {formData.isAllDay && <Check size={14} className="text-white" />}
                     </div>
                     <input 
                        type="checkbox" 
                        checked={!!formData.isAllDay}
                        onChange={(e) => setFormData({...formData, isAllDay: e.target.checked})}
                        className="hidden"
                     />
                     <span className="text-sm font-bold text-gray-700 dark:text-gray-200">All Day</span>
                 </label>
            </div>

            {/* Recurrence Options */}
            <div>
                 <button 
                    type="button" 
                    onClick={handleRecurrenceToggle}
                    className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 ${showRecurrence ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                 >
                     <Repeat size={14} /> {showRecurrence ? 'Remove recurrence' : 'Set up repeat'}
                 </button>

                 {showRecurrence && (
                     <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700 space-y-3 animate-in slide-in-from-top-2">
                        <div className="flex gap-2">
                             {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as RecurrenceFreq[]).map(freq => (
                                 <button
                                    key={freq}
                                    type="button"
                                    onClick={() => updateRecurrence('freq', freq)}
                                    className={`
                                        flex-1 py-1.5 text-[0.6rem] font-bold rounded border transition-colors
                                        ${formData.recurrence?.freq === freq ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300'}
                                    `}
                                 >
                                     {freq}
                                 </button>
                             ))}
                        </div>
                        <div className="flex flex-col gap-1">
                             <div className="flex justify-between items-baseline">
                                <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Until:</label>
                                {!isRecurrenceValid && (
                                    <span className="text-[0.6rem] text-red-500 font-bold flex items-center gap-1">
                                        <AlertCircle size={10} /> Invalid Date
                                    </span>
                                )}
                             </div>
                             
                             <div className="flex gap-2 relative group">
                                {/* VISIBLE MASK */}
                                <div className={`flex-1 flex items-center gap-2 bg-white dark:bg-gray-800 border rounded px-2 py-1 text-xs dark:text-white h-full ${!isRecurrenceValid ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-200 dark:border-gray-600 group-hover:border-blue-300'}`}>
                                    <span className={`truncate ${!formData.recurrence?.until ? 'text-gray-400 italic' : ''}`}>
                                         {formData.recurrence?.until 
                                            ? new Date(formData.recurrence.until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
                                            : 'Select End Date...'}
                                    </span>
                                </div>

                                {/* INVISIBLE TRIGGER */}
                                <input 
                                    type="date"
									name="recurrenceUntil"
                                    min={getDateInputValue(formData.startTime)}
                                    value={formData.recurrence?.until ? getDateInputValue(formData.recurrence.until) : ''}
                                    onChange={(e) => handleUntilChange(e.target.value)}
                                    onClick={(e) => e.currentTarget.showPicker()}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <button
                                    type="button"
                                    onClick={setUntilToday}
                                    className="px-2 border rounded bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:border-blue-200 z-20"
                                    title="Set Until Today"
                                >
                                    Today
                                </button>
                                <button 
                                    type="button"
                                    onClick={setUntilForever}
                                    title="Repeat Forever"
                                    className={`px-3 border rounded transition-colors z-20 ${!formData.recurrence?.until ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-600'}`}
                                >
                                    <InfinityIcon size={16} />
                                </button>
                             </div>
                             <p className="text-[0.6rem] text-gray-400 italic text-right">
                                 {formData.recurrence?.until ? 'Ends on this date (inclusive)' : 'Repeats forever'}
                             </p>
                        </div>
                     </div>
                 )}

                 {/* Restore Deleted Instances (EXDATES) */}
                 {showRecurrence && sortedExdates.length > 0 && (
                     <div className="mt-3 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-100 dark:border-red-800 animate-in slide-in-from-top-2">
                         <div className="text-[0.6rem] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                             <Trash2 size={10} /> Restorable Instances
                         </div>
                         <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                             {sortedExdates.map(dateStr => {
                                 const [y, m, d] = dateStr.split('-').map(Number);
                                 const localDate = new Date(y, m - 1, d);
                                 return (
                                     <div key={dateStr} className="flex items-center justify-between bg-white dark:bg-gray-800 border border-red-100 dark:border-red-900 px-2 py-1.5 rounded">
                                         <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{localDate.toLocaleDateString()}</span>
                                            <span className="text-[0.6rem] text-gray-400">{localDate.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                                         </div>
                                         <button 
                                            onClick={() => handleRestoreInstance(dateStr)}
                                            className="text-[0.6rem] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                         >
                                             <Undo size={10} /> Restore
                                         </button>
                                     </div>
                                 )
                             })}
                         </div>
                     </div>
                 )}
            </div>

            {/* Description */}
            <div>
                 <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Description</label>
                 <textarea 
                    name="eventDescription"
                    id="eventDescription"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Details, location, notes..."
                    rows={2}
                    className="w-full bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-sm focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none resize-none dark:text-white dark:placeholder-gray-500"
                 />
            </div>

            {/* User Assignment */}
            <div>
                 <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Participants</label>
                 <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                     {users.map(u => {
                         const isSelected = formData.userIds?.includes(u.id);
                         const color = getUserColor(u);
                         return (
                             <button
                                key={u.id}
                                onClick={() => toggleUser(u.id)}
                                className={`flex flex-col items-center gap-1 min-w-[3.5rem] transition-opacity ${isSelected ? 'opacity-100' : 'opacity-40 grayscale hover:opacity-70'}`}
                             >
                                 <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 text-xl overflow-hidden shadow-sm transition-transform ${isSelected ? 'scale-105' : 'scale-100'}`} style={{ borderColor: color }}>
                                     {u.photoUrl ? <img src={u.photoUrl} alt="" className="w-full h-full object-cover"/> : u.avatar}
                                 </div>
                                 <span className="text-[0.6rem] font-bold text-gray-600 dark:text-gray-400 truncate w-full text-center">{u.username.split(' ')[0]}</span>
                             </button>
                         )
                     })}
                 </div>
            </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between gap-3 sticky bottom-0 z-10 shrink-0">
                 {deleteStage === 'SERIES_CHOICE' ? (
                    <div className="flex flex-col gap-2 w-full animate-in slide-in-from-left-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Delete Options</span>
                            <button onClick={handleCancelDelete} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Cancel</button>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleDeleteInstance} className="flex-1 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 transition-colors">
                                This Instance
                            </button>
                            <button onClick={handleConfirmDeleteSeries} className="flex-1 py-2 bg-red-600 rounded-lg text-xs font-bold text-white hover:bg-red-700 shadow-sm transition-colors">
                                Entire Series
                            </button>
                        </div>
                    </div>
                 ) : (
                     <>
                        {event && (
                            <button 
                                onClick={handleDeleteClick}
                                className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                            >
                                <Trash2 size={20} />
                            </button>
                        )}
                        <button 
                            onClick={handleSave}
                            disabled={!isValid}
                            className="flex-1 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-200 dark:shadow-blue-900/20 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                        >
                            <Save size={18} /> Save Event
                        </button>
                     </>
                 )}
            </div>
        </div>
      </div>
    </div>
  );
  if (!currentUser) return null; // Safety check since context can be null
};

export default EventModal;