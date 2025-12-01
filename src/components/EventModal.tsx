
import React, { useState, useEffect, useMemo } from 'react';
import { CalendarEvent, User, RecurrenceFreq } from '../types';
import { toLocalDateString } from '../constants';
import { X, Trash2, Save, Calendar as CalIcon, Repeat, Check, Infinity as InfinityIcon, AlertCircle, RefreshCw, Info, Undo, Clock } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import DatePicker from 'react-datepicker';
import { createRRule, parseRRule } from '../services/recurrence';
import { v4 as uuidv4 } from 'uuid';

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
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<CalendarEvent>>({});
  const [initialState, setInitialState] = useState<string>(''); // For dirty checking
  const [deleteStage, setDeleteStage] = useState<'IDLE' | 'SERIES_CHOICE'>('IDLE');
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [isComplexRule, setIsComplexRule] = useState(false); // New Guardrail

  // Hook: Check if we are compliant with React Rules (must be top level)
  // Sort Exdates Chronologically - Moved to top to prevent conditional hook error
  const sortedExdates = useMemo(() => {
      if (!formData.exdates) return [];
      return [...formData.exdates].sort((a, b) => a.localeCompare(b));
  }, [formData.exdates]);

  useEffect(() => {
    if (isOpen) {
      setDeleteStage('IDLE');
      setIsComplexRule(false);
      
      let initData: Partial<CalendarEvent> = {};
      let showRec = false;

      if (event) {
        // LOGIC CHANGE:
        // If Recurring: Load the SERIES START (Anchor), not the instance date.
        
        let recurrenceState = undefined;
        let showRec = false;

        if (event.rrule) {
            showRec = true;
            const parsed = parseRRule(event.rrule);
            if (parsed) {
                recurrenceState = parsed;
            } else {
                setIsComplexRule(true); // Valid RRULE but too complex for our UI
            }
        }

        if (showRec) {
            initData = { 
                ...event,
                startTime: event.startTime,
                recurrence: recurrenceState as any
            };
        } else {
             // Use initialDate if provided (the slot clicked), otherwise existing start time
             const start = initialDate ? new Date(initialDate) : new Date(event.startTime);
             initData = { 
                ...event,
                startTime: start.toISOString(),
                recurrence: undefined
            };
        }
        setShowRecurrence(showRec);
      } else {
        // New Event
        const start = initialDate ? new Date(initialDate) : new Date();
        start.setHours(9, 0, 0, 0); 
        
        initData = {
          title: '',
          description: '',
          startTime: start.toISOString(),
          userIds: [currentUser.id],
          isAllDay: false
        };
        setShowRecurrence(false);
      }
      
      setFormData(initData);
      // Store stringified snapshot for deep comparison later
      // We sort userIds to ensure array order doesn't trigger false positives
      if (initData.userIds) initData.userIds.sort();
      setInitialState(JSON.stringify(initData));
    }
  }, [isOpen, event, initialDate, currentUser.id]);

  if (!isOpen) return null;

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!formData.title?.trim() || !formData.startTime) {
        return;
    }
    
    // Generate RRULE
    let rruleStr: string | undefined = undefined;
    if (showRecurrence) {
        if (isComplexRule) {
            // Preserve existing complex rule if we are just editing Title/Time
            rruleStr = event?.rrule;
        } else if (formData.recurrence?.freq && formData.startTime) {
            rruleStr = createRRule(
                formData.recurrence.freq, 
                new Date(formData.startTime), 
                formData.recurrence.until ? new Date(formData.recurrence.until) : undefined
            );
        }
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
      rrule: rruleStr,
      icalUID: event?.icalUID || uuidv4(), // Generate UID immediately for local deduping
      exdates: formData.exdates 
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

      if (event.rrule) {
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

  const handleDateChange = (date: Date | null) => {
      if (!date) return;
      
      const current = new Date(formData.startTime || new Date());
      // Preserve time from current, update date from new input
      const newDate = new Date(date);
      newDate.setHours(current.getHours(), current.getMinutes(), 0, 0);
      
      setFormData({ ...formData, startTime: newDate.toISOString() });
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const [h, m] = e.target.value.split(':').map(Number);
      const newDate = new Date(formData.startTime || new Date());
      newDate.setHours(h);
      newDate.setMinutes(m);
      setFormData({ ...formData, startTime: newDate.toISOString() });
  };

  const getTimeValue = () => {
      if (!formData.startTime) return '';
      const d = new Date(formData.startTime);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

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

  const handleUntilChange = (date: Date | null) => {
      if (!date) {
          updateRecurrence('until', '');
          return;
      }
      // Ensure until date is end of day or standard midnight? 
      // Using standard local midnight to match logic
      date.setHours(0,0,0,0);
      updateRecurrence('until', date.toISOString());
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

  // Validation
  const hasTitle = !!formData.title?.trim();
  
  // Recurrence Validation
  let isRecurrenceValid = true;
  if (showRecurrence && formData.recurrence?.until) {
      if (formData.recurrence.until === '') {
          isRecurrenceValid = false;
      } else {
          const untilTime = new Date(formData.recurrence.until).getTime();
          const startTime = new Date(formData.startTime!).getTime() - 1000; 
          if (isNaN(untilTime) || untilTime < startTime) {
              isRecurrenceValid = false;
          }
      }
  }

  if (showRecurrence && formData.recurrence?.until === '') {
      isRecurrenceValid = false;
  }
  
  // Dirty Check
  // We create a temp object matching the structure of initialState to compare
  const currentSnapshot = JSON.stringify({
      ...formData,
      userIds: [...(formData.userIds || [])].sort()
  });
  
  // Check strict recurrence toggle state vs presence of recurrence data
  const recurrenceStateChanged = !!event === false ? false : (showRecurrence !== !!event.rrule && !isComplexRule);
  
  const isDirty = !event || recurrenceStateChanged || currentSnapshot !== initialState;
  const isValid = hasTitle && isRecurrenceValid;

  // Display Helpers
  const isRecurring = !!event?.rrule || showRecurrence;
  const displayDateLabel = isRecurring ? t('event_modal.series_start') : t('event_modal.date');
  
  const instanceDateDisplay = (event && event.rrule && initialDate) 
    ? initialDate.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' })
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
                {event ? (isRecurring ? t('event_modal.edit_series') : t('event_modal.edit_event')) : t('event_modal.new_event')}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400">
                <X size={20} />
            </button>
            </div>

            {/* Recurrence Banner */}
            {event && event.rrule && (
                <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2 flex flex-col gap-1 border-b border-blue-100 dark:border-blue-800">
                    <div className="flex items-start gap-2">
                        <RefreshCw size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-800 dark:text-blue-300 font-bold">{t('event_modal.editing_series')}</p>
                    </div>
                    <p className="text-[0.6rem] text-blue-700 dark:text-blue-400 leading-tight pl-6">
                        {t('event_modal.editing_series_desc')}
                    </p>
                </div>
            )}

            {/* Complex Rule Warning */}
            {isComplexRule && (
                <div className="bg-amber-50 dark:bg-amber-900/30 px-4 py-2 flex flex-col gap-1 border-b border-amber-100 dark:border-amber-800">
                    <div className="flex items-start gap-2">
                        <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-[0.65rem] text-amber-800 dark:text-amber-300 font-bold leading-tight">
                            {t('event_modal.complex_rule_warning')}
                        </p>
                    </div>
                </div>
            )}

            {/* Selected Instance Helper */}
            {instanceDateDisplay && (
                <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-600">
                    <Info size={14} className="text-gray-500 dark:text-gray-400" />
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                        {t('event_modal.selected_instance')}: <span className="font-bold text-gray-800 dark:text-white">{instanceDateDisplay}</span>
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
                placeholder={t('event_modal.title')}
                autoFocus
                />
            </div>

            {/* Date & Time */}
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">{displayDateLabel}</label>
                    <div className="relative">
                        <CalIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none z-10" />
                        <DatePicker 
                            selected={formData.startTime ? new Date(formData.startTime) : null}
                            onChange={handleDateChange}
                            dateFormat={t('formats.date_picker')}
                            className="w-full pl-10 pr-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-800 dark:text-white border-transparent focus:border-blue-500 focus:ring-0 cursor-pointer"
                            portalId="root"
                            locale={currentUser.preferences?.language?.split('-')[0] || 'en'}
                            showMonthDropdown
                            showYearDropdown
                            dropdownMode="select"
                        />
                    </div>
                </div>
                
                <div className={`w-5/12 transition-opacity duration-200 ${formData.isAllDay ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                    <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">{t('event_modal.time')}</label>
                    <div className="relative">
                         <input
                            type="time"
                            value={getTimeValue()}
                            onChange={handleTimeChange}
                            className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-800 dark:text-white border-transparent focus:border-blue-500 focus:ring-0 outline-none"
                         />
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
                     <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t('event_modal.all_day')}</span>
                 </label>
            </div>

            {/* Recurrence Options */}
            <div>
                 {!isComplexRule && (
                     <button 
                        type="button" 
                        onClick={handleRecurrenceToggle}
                        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 ${showRecurrence ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                     >
                         <Repeat size={14} /> {showRecurrence ? t('event_modal.remove_repeat') : t('event_modal.repeat')}
                     </button>
                 )}

                 {showRecurrence && !isComplexRule && (
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
                                     {t(`recurrence.${freq.toLowerCase()}`)}
                                 </button>
                             ))}
                        </div>
                        <div className="flex flex-col gap-1">
                             <div className="flex justify-between items-baseline">
                                <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('event_modal.until')}</label>
                                {!isRecurrenceValid && (
                                    <span className="text-[0.6rem] text-red-500 font-bold flex items-center gap-1">
                                        <AlertCircle size={10} /> {t('event_modal.invalid_date')}
                                    </span>
                                )}
                             </div>
                             
                             <div className="flex gap-2 relative">
                                <div className="flex-1 relative">
                                    <DatePicker 
                                        selected={formData.recurrence?.until ? new Date(formData.recurrence.until) : null}
                                        onChange={handleUntilChange}
                                        placeholderText={t('event_modal.select_end_date')}
                                        minDate={formData.startTime ? new Date(formData.startTime) : undefined}
                                        className={`w-full bg-white dark:bg-gray-800 border rounded px-2 py-1 text-xs dark:text-white outline-none cursor-pointer ${!isRecurrenceValid ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-200 dark:border-gray-600 focus:border-blue-300'}`}
                                        portalId="root"
                                        locale={currentUser.preferences?.language?.split('-')[0] || 'en'}
                                        showMonthDropdown
                                        showYearDropdown
                                        dropdownMode="select"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={setUntilToday}
                                    className="px-2 border rounded bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:border-blue-200"
                                    title={t('event_modal.today')}
                                >
                                    {t('event_modal.today')}
                                </button>
                                <button 
                                    type="button"
                                    onClick={setUntilForever}
                                    title="Repeat Forever"
                                    className={`px-3 border rounded transition-colors ${!formData.recurrence?.until ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-600'}`}
                                >
                                    <InfinityIcon size={16} />
                                </button>
                             </div>
                             <p className="text-[0.6rem] text-gray-400 italic text-right">
                                 {formData.recurrence?.until ? t('event_modal.ends_on') : t('event_modal.repeats_forever')}
                             </p>
                        </div>
                     </div>
                 )}

                 {/* Restore Deleted Instances (EXDATES) */}
                 {showRecurrence && sortedExdates.length > 0 && (
                     <div className="mt-3 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-100 dark:border-red-800 animate-in slide-in-from-top-2">
                         <div className="text-[0.6rem] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                             <Trash2 size={10} /> {t('event_modal.restorable')}
                         </div>
                         <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                             {sortedExdates.map(dateStr => {
                                 const [y, m, d] = dateStr.split('-').map(Number);
                                 const localDate = new Date(y, m - 1, d);
                                 return (
                                     <div key={dateStr} className="flex items-center justify-between bg-white dark:bg-gray-800 border border-red-100 dark:border-red-900 px-2 py-1.5 rounded">
                                         <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{localDate.toLocaleDateString()}</span>
                                            <span className="text-[0.6rem] text-gray-400">{localDate.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                                         </div>
                                         <button 
                                            onClick={() => handleRestoreInstance(dateStr)}
                                            className="text-[0.6rem] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                         >
                                             <Undo size={10} /> {t('event_modal.restore')}
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
                 <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-1 block">{t('event_modal.description')}</label>
                 <textarea 
                    name="eventDescription"
                    id="eventDescription"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder={t('event_modal.description_placeholder')}
                    rows={2}
                    className="w-full bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-sm focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none resize-none dark:text-white dark:placeholder-gray-500"
                 />
            </div>

            {/* User Assignment */}
            <div>
                 <label className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-wider mb-2 block">{t('event_modal.participants')}</label>
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
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{t('event_modal.delete_options')}</span>
                            <button onClick={handleCancelDelete} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">{t('event_modal.cancel')}</button>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleDeleteInstance} className="flex-1 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 transition-colors">
                                {t('event_modal.this_instance')}
                            </button>
                            <button onClick={handleConfirmDeleteSeries} className="flex-1 py-2 bg-red-600 rounded-lg text-xs font-bold text-white hover:bg-red-700 shadow-sm transition-colors">
                                {t('event_modal.entire_series')}
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
                            disabled={!isValid || !isDirty}
                            className="flex-1 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-200 dark:shadow-blue-900/20 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Save size={18} /> {t('event_modal.save')}
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