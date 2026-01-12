import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CalendarEvent, User, SystemSettings } from '../types';
import { toLocalDateString } from '../constants';
import { ChevronLeft, ChevronRight, Search, X, Filter, Trash2, CheckSquare, Square, Repeat, ChevronDown, CalendarDays, Users, Check, Plus } from 'lucide-react';
import { getMoonPhase, getWeatherIcon, getWeatherDescriptionKey, WeatherData } from '../services/integrations';
import { expandRRule } from '../services/recurrence';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import DatePicker from 'react-datepicker';

interface AgendaGroup {
    label: string;
    ts: number;
    events: CalendarEvent[];
}

interface CalendarProps {
  events: CalendarEvent[];
  viewMode: 'WEEK' | 'MONTH' | 'AGENDA';
  onViewModeChange: (mode: 'WEEK' | 'MONTH' | 'AGENDA') => void;
  onEventClick: (event: CalendarEvent, date?: Date) => void;
  onDateClick: (date: Date) => void;
  onUpdateEvents: (events: CalendarEvent[], skipHistory?: boolean) => void;
  settings: SystemSettings;
  weatherData: WeatherData[];
  holidayEvents: CalendarEvent[];
  isSidebar?: boolean;
  isReadOnly?: boolean;
}

const Calendar: React.FC<CalendarProps> = ({ 
    events, viewMode, onViewModeChange, 
    onEventClick, onDateClick, onUpdateEvents, settings, weatherData, holidayEvents, isSidebar, isReadOnly 
}) => {
  const { users, currentUser } = useUser();
  const { t, i18n } = useTranslation();
  const { activePalette, getUserColor } = useTheme();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [displayDate, setDisplayDate] = useState(currentDate);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastWheelTime = useRef(0);
  const clickStartPos = useRef<{x: number, y: number} | null>(null);

  const handleCellMouseDown = (e: React.MouseEvent) => {
      clickStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleCellClick = (e: React.MouseEvent, date: Date) => {
      // 1. Check if we are suppressing clicks due to an aborted drag/shake on an event
      if (ignoreClickRef.current) {
          ignoreClickRef.current = false;
          return;
      }

      // 2. Check for physical movement (standard drag detection)
      if (clickStartPos.current) {
          const dx = e.clientX - clickStartPos.current.x;
          const dy = e.clientY - clickStartPos.current.y;
          if (Math.sqrt(dx*dx + dy*dy) > 10) return; // Ignore drags
      }
      onDateClick(date);
  };
  
  // Date Picker State
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  // Search/Agenda State
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  
  // Agenda: Bulk Action & Visibility State
  const [hidePastEvents, setHidePastEvents] = useState(false);
  const [hideHolidays, setHideHolidays] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [showManageUsersModal, setShowManageUsersModal] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Feedback State for "Stuck" Drags
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [tooltipState, setTooltipState] = useState<{ id: string, x: number, y: number } | null>(null);
  const ignoreClickRef = useRef(false);

  // Detect Mobile View based on standard breakpoint logic
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  const effectiveViewMode = isSidebar ? 'AGENDA' : viewMode;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setDisplayDate(currentDate);
  }, [currentDate, effectiveViewMode, isMobile]);

// --- Auto-Scroll Logic (Debounced & Safer) ---
  useEffect(() => {
    const timer = setTimeout(() => {
        if (!scrollRef.current) return;

        if (effectiveViewMode === 'AGENDA') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const headers = Array.from(document.querySelectorAll('[data-group-ts]'));
            let target: Element | null = null;
            const firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
            
            for (const header of headers) {
                const ts = parseInt(header.getAttribute('data-group-ts') || '0');
                if (ts >= firstDayOfCurrentMonth) {
                    target = header;
                    break;
                }
            }
            if (target) {
                target.scrollIntoView({ behavior: 'auto', block: 'start' });
            }
        } else {
            // FIXED: Scroll to the DISPLAY date (what the user is looking at), 
            // not necessarily 'currentDate' (selected state).
            // This prevents fighting the scroll handler.
            const targetDate = effectiveViewMode === 'WEEK' ? displayDate : currentDate;
            const dateId = `date-${targetDate.toDateString().replace(/ /g, '-')}`;
            const el = document.getElementById(dateId);
            
            if (el) {
                // Only scroll if the element is actually out of view
                const rect = el.getBoundingClientRect();
                const containerRect = scrollRef.current.getBoundingClientRect();
                
                const isVisible = (
                    rect.top >= containerRect.top &&
                    rect.bottom <= containerRect.bottom
                );

                if (!isVisible) {
                    el.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: effectiveViewMode === 'WEEK' ? 'start' : 'nearest' 
                    });
                }
            } else {
                scrollRef.current.scrollTop = 0;
            }
        }
    }, 100); 
    return () => clearTimeout(timer);
  }, [effectiveViewMode, currentDate]); // Removed displayDate from dependency to stop loops

  useEffect(() => {
      setSelectedEventIds(new Set());
      setShowManageUsersModal(false);
  }, [effectiveViewMode]);

  if (!currentUser) return null;

  // --- Date Limits (±50 Years) ---
  const MAX_YEAR = new Date().getFullYear() + 50;
  const MIN_YEAR = new Date().getFullYear() - 50;

  const canGoNext = () => {
    const nextYear = new Date(currentDate).getFullYear(); 
    return nextYear <= MAX_YEAR;
  };

  const canGoPrev = () => {
    const prevYear = new Date(currentDate).getFullYear();
    return prevYear >= MIN_YEAR;
  };

  const expandEvents = (startRange: Date, endRange: Date, rawEvents: CalendarEvent[]) => {
      let expanded: CalendarEvent[] = [];
      
      rawEvents.forEach(e => {
          if (e.rrule) {
              // Recurring: Use RRule Engine
              const instances = expandRRule(e, startRange, endRange);
              expanded = expanded.concat(instances);
          } else {
              // Single Event: Simple Check
              const start = new Date(e.startTime);
              // Check overlap
              if (start >= startRange && start <= endRange) {
                  expanded.push(e);
              }
          }
      });
      return expanded;
  };

  const allEventsCombined = useMemo(() => {
      const visibleHolidays = currentUser.preferences?.showHolidays !== false ? holidayEvents : [];
      return [...events, ...visibleHolidays];
  }, [events, holidayEvents, currentUser.preferences?.showHolidays]);

  const monthData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayIndex = firstDayOfMonth.getDay(); 
    
    const days = [];
    for (let i = 0; i < startDayIndex; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [currentDate]);

  const weekData = useMemo(() => {
    if (isMobile && effectiveViewMode === 'WEEK') {
        const days = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(currentDate);
          d.setDate(currentDate.getDate() + i);
          days.push(d);
        }
        return days;
    } else {
        const start = new Date(currentDate);
        start.setDate(currentDate.getDate() - currentDate.getDay());
        const days = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          days.push(d);
        }
        return days;
    }
  }, [currentDate, isMobile, effectiveViewMode]);

  const agendaData = useMemo<Record<string, AgendaGroup>>(() => {
    const now = new Date();
    const startRange = hidePastEvents ? new Date(now.setHours(0,0,0,0)) : new Date(new Date().setFullYear(now.getFullYear() - 1));
    const endRange = new Date(new Date().setFullYear(now.getFullYear() + 2));
    
    let expanded = expandEvents(startRange, endRange, allEventsCombined);
    
    expanded = expanded.filter(e => {
        if (searchQuery.trim()) {
            const lowerQ = searchQuery.toLowerCase();
            const matches = e.title.toLowerCase().includes(lowerQ) || 
                            (e.description && e.description.toLowerCase().includes(lowerQ));
            if (!matches) return false;
        }
        
        if (filterUserIds.length > 0) {
            const matches = e.userIds.some(uid => filterUserIds.includes(uid));
            if (!matches) return false;
        }

        const isHoliday = e.id.startsWith('holiday-');
        if (isHoliday) {
            const startTime = new Date(e.startTime);
            const today = new Date();
            today.setHours(0,0,0,0);
            if (startTime < today) return false;
            if (hideHolidays) return false;
        }

        return true;
    });
    
    expanded.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const grouped: Record<string, AgendaGroup> = {};
    expanded.forEach(e => {
        const d = new Date(e.startTime);
        const label = d.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
        const key = `${d.getFullYear()}-${d.getMonth()}`; 
        
        if (!grouped[key]) {
            grouped[key] = { 
                label, 
                ts: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
                events: [] 
            };
        }
        grouped[key].events.push(e);
    });
    return grouped;
  }, [allEventsCombined, searchQuery, filterUserIds, hidePastEvents, hideHolidays]);

  const getEventsForDay = (date: Date) => {
    if (!date) return [];
    const startOfDay = new Date(date); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(date); endOfDay.setHours(23,59,59,999);
    
    // Slight buffer for RRule inclusive calculation quirks
    const dayEvents = expandEvents(startOfDay, endOfDay, allEventsCombined);
    
    return dayEvents.sort((a, b) => {
        const isAHoliday = a.id.startsWith('holiday-');
        const isBHoliday = b.id.startsWith('holiday-');

        if (isAHoliday && !isBHoliday) return -1;
        if (!isAHoliday && isBHoliday) return 1;
        if (isAHoliday && isBHoliday) return a.title.localeCompare(b.title);

        const isAAllDay = !!a.isAllDay;
        const isBAllDay = !!b.isAllDay;

        if (isAAllDay && !isBAllDay) return -1;
        if (!isAAllDay && isBAllDay) return 1;
        if (isAAllDay && isBAllDay) return a.title.localeCompare(b.title);

        const timeDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        if (timeDiff !== 0) return timeDiff;
        
        return a.title.localeCompare(b.title);
    });
  };

  const getLuminance = (hex: string) => {
    const c = hex.replace('#', '');
    const rgb = parseInt(c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >>  8) & 0xff;
    const b = (rgb >>  0) & 0xff;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const getTextColor = (userIds: string[], title: string) => {
      if (!userIds || userIds.length === 0) return '#1f2937'; 

      const fontScale = currentUser.fontSizeScale || 1;
      const charWidth = 8.5 * fontScale;
      const padding = 12; 
      const estimatedTextWidth = Math.max(20, (title?.length || 0) * charWidth + padding);

      const containerWidth = isMobile ? 300 : 150;
      
      const sortedEventUsers = users.filter(u => userIds.includes(u.id));
      if (sortedEventUsers.length === 0) return '#1f2937';

      const bandWidth = containerWidth / sortedEventUsers.length;

      let totalLum = 0;
      let totalWeight = 0;

      sortedEventUsers.forEach((u, index) => {
          const hex = getUserColor(u); 
          const lum = getLuminance(hex);

          const bandStart = index * bandWidth;
          const bandEnd = (index + 1) * bandWidth;
          
          const overlapStart = Math.max(0, bandStart);
          const overlapEnd = Math.min(estimatedTextWidth, bandEnd);
          const overlapPixels = Math.max(0, overlapEnd - overlapStart);

          if (overlapPixels > 0) {
              const weight = overlapPixels * (index === 0 ? 3.0 : 1.0);
              totalLum += lum * weight;
              totalWeight += weight;
          }
      });

      if (totalWeight === 0) {
           const u0 = sortedEventUsers[0];
           const l0 = u0 ? getLuminance(getUserColor(u0)) : 100;
           return l0 > 150 ? '#1f2937' : '#ffffff';
      }

      const avgLum = totalLum / totalWeight;
      return avgLum > 150 ? '#1f2937' : '#ffffff';
  };

  const getEventBackground = (userIds: string[]) => {
    if (!userIds || userIds.length === 0) return '#9ca3af'; 
    const eventUsers = users.filter(u => userIds.includes(u.id));
    if (eventUsers.length === 0) return '#9ca3af';
    if (eventUsers.length === 1) return getUserColor(eventUsers[0]);

    const colors = eventUsers.map(u => getUserColor(u));
    const step = 100 / colors.length;
    const gradientStops = colors.map((c, i) => {
        const start = i * step;
        const end = (i + 1) * step;
        return `${c} ${start}% ${end}%`;
    }).join(', ');

    return `linear-gradient(90deg, ${gradientStops})`;
  };

  const next = () => {
    if (!canGoNext()) return;
    const newDate = new Date(currentDate);
    if (effectiveViewMode === 'MONTH') {
        newDate.setMonth(newDate.getMonth() + 1);
    } else {
        newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const prev = () => {
    if (!canGoPrev()) return;
    const newDate = new Date(currentDate);
    if (effectiveViewMode === 'MONTH') {
        newDate.setMonth(newDate.getMonth() - 1);
    } else {
        newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const handleJumpToDate = (monthIndex: number) => {
      const newDate = new Date(currentDate);
      newDate.setFullYear(pickerYear);
      newDate.setMonth(monthIndex);
      setCurrentDate(newDate);
      setIsDatePickerOpen(false);
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (effectiveViewMode === 'AGENDA' || isDatePickerOpen) return;
    const now = Date.now();
    if (now - lastWheelTime.current < 300) return;
    if (e.deltaY > 25) {
        next();
        lastWheelTime.current = now;
    } else if (e.deltaY < -25) {
        prev();
        lastWheelTime.current = now;
    }
  };

  const formatTime = (isoString: string) => {
      const date = new Date(isoString);
      // Respect system preference completely (e.g. 17:00 vs 5:00 PM)
      return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const rafRef = useRef<number | null>(null);

  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
      if (effectiveViewMode !== 'WEEK' || !isMobile) return;
      
      const containerScrollTop = e.currentTarget.scrollTop;
      
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
          const threshold = containerScrollTop + 80;

          for (const d of weekData) {
              const dateId = `date-${d.toDateString().replace(/ /g, '-')}`;
              const el = document.getElementById(dateId);
              if (el) {
                  const top = el.offsetTop;
                  const bottom = top + el.offsetHeight;
                  if (top <= threshold && bottom > threshold) {
                       if (d.getTime() !== displayDate.getTime()) {
                           setDisplayDate(d);
                       }
                       break;
                  }
              }
          }
      });
  };

  useEffect(() => {
      return () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
  }, []);

  const renderDateExtras = (date: Date) => {
      if (!date || effectiveViewMode === 'AGENDA') return null; 
      const extras = [];
      
      if (currentUser.preferences?.showMoonPhases !== false) {
          const mp = getMoonPhase(date);
          if (mp) {
              extras.push(<span key="moon" title={t(mp.label)} className="text-2xl leading-none select-none">{mp.icon}</span>);
          }
      }

      if (settings.weatherEnabled && currentUser.preferences?.showWeather !== false && weatherData.length > 0) {
          const dateStr = toLocalDateString(date);
          const w = weatherData.find(d => d.date === dateStr);
          if (w) {
              const high = Math.round(w.maxTemp);
              const low = Math.round(w.minTemp);
              extras.push(
                  <div key="weather" className="flex items-center gap-1 text-gray-600 dark:text-gray-300 bg-white/50 dark:bg-gray-700/50 rounded pr-1" title={`${t(getWeatherDescriptionKey(w.weatherCode))} (High: ${high}°, Low: ${low}°)`}>
                      <span className="text-xl leading-none select-none">{getWeatherIcon(w.weatherCode)}</span>
                      <span className="text-xs font-bold leading-none -space-y-0.5 opacity-80 flex flex-col items-end">
                        <span className="text-gray-800 dark:text-gray-200">H:{high}°</span>
                        <span className="text-gray-500 dark:text-gray-400">L:{low}°</span>
                      </span>
                  </div>
              );
          }
      }

      return (
          <div className="flex gap-2 items-center justify-center mt-1 min-h-[20px] flex-wrap">
              {extras}
          </div>
      );
  };

  const toggleSelection = (id: string) => {
      const realId = id.split('_')[0];
      const next = new Set(selectedEventIds);
      if (next.has(realId)) next.delete(realId);
      else next.add(realId);
      setSelectedEventIds(next);
  };

  const handleDragStart = (e: React.DragEvent, event: CalendarEvent) => {
      if (isSidebar || effectiveViewMode !== 'WEEK') return;

      // RECURRENCE GUARD:
      // If recurring, block the drag immediately, trigger shake, and show popup
      if (event.rrule || event.id.includes('_')) {
          e.preventDefault(); // Stop the ghost image from forming
          
          // 1. Trigger Visuals
          setShakeId(event.id);
          const rect = e.currentTarget.getBoundingClientRect();
          setTooltipState({
              id: event.id,
              x: rect.left + rect.width / 2,
              y: rect.bottom + 10 // Position below event
          });

          // 2. Block the subsequent Click event
          ignoreClickRef.current = true;
          
          // 3. Cleanup
          setTimeout(() => setShakeId(null), 400); 
          setTimeout(() => setTooltipState(null), 2500); 
          
          return;
      }

      e.dataTransfer.setData('application/json', JSON.stringify(event));
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, date: Date) => {
      if (isSidebar || effectiveViewMode !== 'WEEK') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const dateStr = toLocalDateString(date);
      if (dragOverDate !== dateStr) setDragOverDate(dateStr);
  };

  const handleDrop = (e: React.DragEvent, targetDate: Date) => {
      e.preventDefault();
      setDragOverDate(null);
      if (isSidebar || effectiveViewMode !== 'WEEK') return;

      try {
          const data = e.dataTransfer.getData('application/json');
          const originalEvent: CalendarEvent = JSON.parse(data);
          
          // We only support moving the entire event instance for now
          // If it's recurring, this might detach it or move the base.
          // For simplicity in this "drag" interaction, we update the Start Time Day.

          const oldStart = new Date(originalEvent.startTime);
          const newStart = new Date(targetDate);
          
          // Preserve original TIME
          newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
          
          const diff = newStart.getTime() - oldStart.getTime();
          
          const updatedEvent = {
              ...originalEvent,
              startTime: newStart.toISOString(),
              endTime: originalEvent.endTime 
                ? new Date(new Date(originalEvent.endTime).getTime() + diff).toISOString() 
                : undefined
          };

          // If the ID has an underscore, it's a virtual instance.
          if (originalEvent.id.includes('_')) {
              return;
          }

          // Update the list
          const updatedList = events.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev);
          onUpdateEvents(updatedList);

      } catch (err) {
          console.error("Drop failed", err);
      }
  };

  const handleBulkDeleteClick = (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      onUpdateEvents(events.filter(e => !selectedEventIds.has(e.id)));
      setSelectedEventIds(new Set());
  };

  const handleToggleUserInBulk = (userId: string) => {
      const selectedEvents = events.filter(e => selectedEventIds.has(e.id));
      const allHaveUser = selectedEvents.every(e => e.userIds.includes(userId));

      const updatedEvents = events.map(e => {
          if (selectedEventIds.has(e.id)) {
              if (allHaveUser) {
                  return { ...e, userIds: e.userIds.filter(id => id !== userId) };
              } else {
                  if (!e.userIds.includes(userId)) {
                      return { ...e, userIds: [...e.userIds, userId] };
                  }
              }
          }
          return e;
      });

      onUpdateEvents(updatedEvents, true); 
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-white dark:bg-gray-900 overflow-hidden relative" ref={containerRef} onWheel={handleWheel}>
      <style>{`
        @keyframes shake-horizontal {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-4px); }
            40% { transform: translateX(4px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
        }
        .animate-shake-x {
            animation: shake-horizontal 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>
      {!isSidebar && (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0 z-20 gap-3">
        {effectiveViewMode === 'AGENDA' ? (
            <div className="flex flex-col w-full gap-2">
             <div className="flex items-center gap-3 w-full">
                <button onClick={() => onViewModeChange('WEEK')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400"><ChevronLeft size={24}/></button>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center px-3 py-2 gap-2">
                    <Search size={18} className="text-gray-400 dark:text-gray-500" />
                    <input type="text" name="agendaSearch" placeholder={t('calendar.search')} autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full dark:text-white dark:placeholder-gray-500"/>
                    <div className="flex items-center gap-2">
                        {searchQuery && <button onClick={() => setSearchQuery('')}><X size={16} className="text-gray-400 dark:text-gray-500"/></button>}
                        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                        <button onClick={() => setShowFilter(!showFilter)} className={`p-1 rounded-md transition-colors ${showFilter || filterUserIds.length > 0 ? 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                            <Filter size={16} className={filterUserIds.length > 0 ? "fill-current" : ""}/>
                        </button>
                    </div>
                </div>
             </div>
             
             {(showFilter || filterUserIds.length > 0) && (
                 <div className="flex gap-2 overflow-x-auto pb-2 px-1 no-scrollbar">
                    <button onClick={() => setFilterUserIds([])} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border ${filterUserIds.length === 0 ? 'bg-gray-800 text-white border-gray-800 dark:bg-gray-200 dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'}`}>{t('calendar.filter_all')}</button>
                    {users.map(u => {
                        const isActive = filterUserIds.includes(u.id);
                        return (
                            <button key={u.id} onClick={() => { if (isActive) setFilterUserIds(prev => prev.filter(id => id !== u.id)); else setFilterUserIds(prev => [...prev, u.id]); }} className={`flex items-center gap-1.5 px-1.5 py-1 pr-3 rounded-full border transition-all ${isActive ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:border-blue-800 dark:ring-blue-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600'}`}>
                                <div className="w-5 h-5 rounded-full text-xs flex items-center justify-center border" style={{ borderColor: getUserColor(u), backgroundColor: isActive ? getUserColor(u) : 'transparent', color: isActive ? '#fff' : '#000' }}>
                                     {u.photoUrl ? <img src={u.photoUrl} alt="" className="w-full h-full rounded-full object-cover" /> : u.avatar}
                                </div>
                                <span className={`text-xs font-bold ${isActive ? 'text-blue-800 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}`}>{u.username}</span>
                            </button>
                        )
                    })}
                 </div>
             )}
            
            <div className="flex items-center justify-between px-1 mt-1 flex-wrap gap-2">
                 <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                        <input type="checkbox" checked={hidePastEvents} onChange={(e) => setHidePastEvents(e.target.checked)} className="rounded text-blue-600 focus:ring-0 w-4 h-4 border-gray-300 dark:border-gray-600 dark:bg-gray-700" /> {t('calendar.hide_past')}
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                        <input type="checkbox" checked={hideHolidays} onChange={(e) => setHideHolidays(e.target.checked)} className="rounded text-blue-600 focus:ring-0 w-4 h-4 border-gray-300 dark:border-gray-600 dark:bg-gray-700" /> {t('calendar.hide_holidays')}
                    </label>
                 </div>
                 <div className="text-[0.625rem] font-bold text-gray-400 dark:text-gray-500 uppercase">{Object.values(agendaData).reduce((acc, g) => acc + g.events.length, 0)} {t('calendar.events_count')}</div>
            </div>
            </div>
        ) : (
            <>
                <div className="flex items-center justify-between w-full">
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                        <button onClick={() => onViewModeChange('WEEK')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${effectiveViewMode === 'WEEK' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}><span className="md:hidden">WEEK</span><span className="hidden md:inline">{t('calendar.week')}</span></button>
                        <button onClick={() => onViewModeChange('MONTH')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${effectiveViewMode === 'MONTH' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{t('calendar.month')}</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onViewModeChange('AGENDA')}
                            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Search & Agenda View"
                        >
                            <Search size={20} />
                        </button>
                        {!isReadOnly && (
                        <button 
                            onClick={() => onDateClick(new Date())} 
                            className="text-white p-2 rounded-full bg-blue-600 shadow-md hover:bg-blue-700 transition-all active:scale-95"
                            title="Create New Event"
                        >
                            <Plus size={18} />
                        </button>
                        )}
                    </div>
                </div>
                <div className="flex items-center justify-between w-full relative">
                     <div className="relative flex items-center gap-1 group">
                        <DatePicker
                            selected={displayDate}
                            onChange={(date: Date) => { setCurrentDate(date); }}
                            dateFormat={t('formats.month_year')}
                            showMonthYearPicker
                            showYearDropdown
                            dropdownMode="select"
                            className="font-bold text-gray-800 dark:text-gray-100 text-lg select-none hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-transparent border-none outline-none cursor-pointer w-40"
                            portalId="root"
                            locale={currentUser.preferences?.language?.split('-')[0] || 'en'}
                            name="calendarMonthPicker"
                            id="calendarMonthPicker"
                        />
                        <ChevronDown size={16} className="text-gray-400 dark:text-gray-500 pointer-events-none absolute right-0" />
                     </div>

                     <div className="flex items-center gap-1">
                        <button onClick={prev} disabled={!canGoPrev()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 disabled:opacity-20"><ChevronLeft size={24}/></button>
                        <button onClick={next} disabled={!canGoNext()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 disabled:opacity-20"><ChevronRight size={24}/></button>
                    </div>
                </div>
            </>
        )}
      </div>
      )}

      {/* --- SIDEBAR HEADER WITH QUICK ADD --- */}
      {isSidebar && !isReadOnly && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0 z-20">
            <button 
                onClick={() => onDateClick(new Date())}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
                <Plus size={16} /> {t('calendar.new_event')}
            </button>
        </div>
      )}

      {effectiveViewMode !== 'AGENDA' && (
          <div className="hidden md:grid grid-cols-7 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10 shrink-0">
            {Array.from({ length: 7 }).map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - d.getDay() + i);
                return (
                    <div key={i} className="text-center py-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        {d.toLocaleDateString(i18n.language, { weekday: 'short' })}
                    </div>
                );
            })}
          </div>
      )}

      {/* View Content */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 custom-scrollbar relative flex flex-col h-full" ref={scrollRef} onScroll={handleContainerScroll}>
        
        {effectiveViewMode === 'AGENDA' && (
            <div className="pb-28"> 
                {Object.keys(agendaData).length === 0 && (
                    <div className="flex flex-col items-center justify-center pt-20 text-gray-400 dark:text-gray-600"><Filter size={48} className="mb-4 opacity-20" /><p>{t('calendar.no_events')}</p></div>
                )}
                
                {Object.entries(agendaData).map(([groupKey, group]) => (
                    <div key={groupKey} data-group-ts={group.ts}>
                        <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 flex justify-between items-center z-10 shadow-sm border-b dark:border-gray-700">
                            <span>{group.label}</span>
                            <span className="text-[0.625rem] opacity-60">{group.events.length}</span>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {group.events.map(event => {
                                const d = new Date(event.startTime);
                                const isPast = d < new Date();
                                const realId = event.id.split('_')[0];
                                const isHoliday = event.id.startsWith('holiday-');
                                const isSelected = selectedEventIds.has(realId);
                                const eventUsers = users.filter(u => event.userIds.includes(u.id));
                                
                                return (
                                    <div 
                                        key={event.id} 
                                        onClick={() => {
                                            if (isHoliday) return; 
                                            const original = events.find(e => e.id === realId);
                                            if (original) onEventClick(original, new Date(event.startTime));
                                        }}
                                        className={`
                                            p-3 flex items-center gap-3 transition-colors
                                            ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
                                            ${isPast ? 'opacity-60' : ''}
                                            ${!isHoliday ? 'cursor-pointer' : ''}
                                        `}
                                    >
                                        {!isHoliday && !isSidebar ? (
                                            <button onClick={(e) => { e.stopPropagation(); toggleSelection(event.id); }} className={`p-1 rounded ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400'}`}>
                                                {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                            </button>
                                        ) : !isSidebar && <div className="w-7" />}

                                        <div className="flex flex-col items-center w-10 shrink-0">
                                            <span className="text-[0.625rem] uppercase font-bold text-gray-400 dark:text-gray-500">{d.toLocaleDateString(i18n.language, { weekday: 'short' })}</span>
                                            <span className="text-xl font-bold text-gray-800 dark:text-gray-200">{d.getDate()}</span>
                                        </div>
                                        
                                        <div className="h-10 flex gap-0.5 shrink-0 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden p-0.5">
                                             {eventUsers.length === 0 ? <div className="w-1 h-full bg-gray-300 dark:bg-gray-600 rounded-full"></div> : eventUsers.map(u => <div key={u.id} className="w-1.5 h-full rounded-full" style={{ backgroundColor: getUserColor(u) }} title={u.username} />)}
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between">
                                                <h3 className="font-bold text-gray-800 dark:text-gray-100 truncate flex items-center gap-1">
                                                    {event.title}
                                                    {(event.rrule || event.id.includes('_')) && <Repeat size={10} className="text-gray-400 dark:text-gray-500" />}
                                                </h3>
                                                {!event.isAllDay && !isHoliday && (
                                                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">{formatTime(event.startTime)}</span>
                                                )}
                                            </div>
                                            {event.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{event.description}</p>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        )}

        {effectiveViewMode === 'MONTH' && (
           <div className="grid grid-cols-7 auto-rows-fr h-full min-h-[500px]">
               {monthData.map((date, idx) => {
                   if (!date) return <div key={idx} className="bg-gray-50/30 dark:bg-gray-800/30 border border-gray-50/50 dark:border-gray-800/50"></div>;
                   const dayEvents = getEventsForDay(date);
                   const isToday = new Date().toDateString() === date.toDateString();
                   const dateId = `date-${date.toDateString().replace(/ /g, '-')}`;

                   return (
                       <div key={idx} id={dateId} onClick={() => { setCurrentDate(date); onViewModeChange('WEEK'); }} className={`border-b border-r border-gray-100 dark:border-gray-700 p-1 flex flex-col items-center gap-1 cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                           <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'}`}>{date.getDate()}</span>
                           {renderDateExtras(date)}
                           <div className="flex flex-col gap-1 w-full px-1 overflow-hidden mt-1">
                               {dayEvents.map(e => (
                                   <div key={e.id} className="h-1.5 w-full rounded-full shadow-sm opacity-80" style={{ background: getEventBackground(e.userIds) }} title={e.title}/>
                               ))}
                           </div>
                       </div>
                   )
               })}
           </div>
        )}

        {effectiveViewMode === 'WEEK' && (
            <div className={`grid grid-cols-1 md:grid-cols-7 gap-0 ${isMobile ? '' : 'h-full grid-rows-1'}`}>
                {weekData.map((date, idx) => {
                    const dayEvents = getEventsForDay(date);
                    const isToday = new Date().toDateString() === date.toDateString();
                    const isPast = date < new Date() && !isToday;
                    const dateId = `date-${date.toDateString().replace(/ /g, '-')}`;
                    const isDragOver = dragOverDate === toLocalDateString(date);

                    return (
                        <div 
                            key={idx} 
                            id={dateId} 
                            onMouseDown={handleCellMouseDown}
                            onClick={(e) => handleCellClick(e, date)} 
                            onDragOver={(e) => handleDragOver(e, date)}
                            onDrop={(e) => handleDrop(e, date)}
                            className={`
                                border-b border-gray-100 dark:border-gray-700 md:border-r p-2 flex flex-col gap-1.5 cursor-pointer group transition-colors 
                                ${isToday ? 'bg-blue-50/40 dark:bg-blue-900/20' : 'bg-white dark:bg-gray-900'} 
                                ${isPast ? 'bg-gray-50/30 dark:bg-gray-800/50' : ''} 
                                ${isDragOver ? 'bg-blue-100 dark:bg-blue-900/40 ring-inset ring-2 ring-blue-500' : ''}
                                hover:bg-gray-50 dark:hover:bg-gray-800
                                ${isMobile ? 'min-h-[240px]' : 'h-full min-h-0 flex-1'} 
                            `}
                        >
                             <div className="flex items-center justify-between md:justify-center mb-1 shrink-0">
                                 <span className="md:hidden text-sm font-bold text-gray-500 dark:text-gray-400 uppercase">{date.toLocaleDateString(i18n.language, { weekday: 'short' })}</span>
                                 <div className="flex items-center gap-2">
                                    <span className="text-[0.625rem] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-tight">{date.toLocaleDateString(i18n.language, { month: 'short' })}</span>
                                    <div className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'}`}>{date.getDate()}</div>
                                 </div>
                             </div>
                             {renderDateExtras(date)}
                             <div className="flex flex-col gap-1.5 mt-1 flex-1">
                                 {dayEvents.map(event => {
                                     const realId = event.id.split('_')[0];
                                     const isHoliday = event.id.startsWith('holiday-');
                                     
                                     // Logic to detect if it's part of a series (Base or Instance)
                                     // LOGIC CHANGE: Allow "draggable" attribute even for recurring items, 
                                     // so we can catch the 'dragstart' event and show the shake animation.
                                     const isSeriesMember = !!event.rrule || event.id.includes('_');
                                     const allowDragAttempt = !isHoliday && !isSidebar && !isReadOnly;
                                     // const isActuallyDraggable = allowDragAttempt && !isSeriesMember; // Removed: We want the grab cursor even if locked

                                     const textColor = isHoliday ? (currentUser.preferences?.theme === 'DARK' ? '#e5e7eb' : '#1f2937') : getTextColor(event.userIds, event.title);
                                     const holidayClass = isHoliday ? 'opacity-70 italic bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200' : '';
                                     
                                     const isShaking = shakeId === event.id;

                                     return (
                                     <div 
                                        key={event.id}
                                        draggable={allowDragAttempt}
                                        onDragStart={(e) => handleDragStart(e, event)}
                                        title={event.title}
                                        onMouseDown={() => { ignoreClickRef.current = false; }} // Reset guard on fresh click
                                        onClick={(e) => { 
                                            e.stopPropagation();
                                            // CHECK GUARD: If we just shook the item, ignore this click
                                            if (ignoreClickRef.current) {
                                                ignoreClickRef.current = false;
                                                return;
                                            }

                                            if (isHoliday) return;
                                            const original = events.find(ev => ev.id === realId);
                                            if(original) onEventClick(original, new Date(event.startTime));
                                        }}
                                        className={`
                                            px-2 py-1.5 rounded shadow-sm truncate hover:opacity-90 transition-all flex items-center gap-2 select-none relative
                                            ${holidayClass} 
                                            ${allowDragAttempt ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                                            ${isShaking ? 'animate-shake-x ring-2 ring-red-400 z-50' : ''}
                                        `}
                                        style={!isHoliday ? { background: getEventBackground(event.userIds), color: textColor } : {}}
                                      >
                                         {!event.isAllDay && !isHoliday && (
                                            <span className="opacity-90 text-xs font-medium tabular-nums shrink-0">{formatTime(event.startTime)}</span>
                                         )}
                                         <span className="truncate text-xs font-bold leading-tight flex-1">{event.title}</span>
                                         {(event.rrule || event.id.includes('_')) && <Repeat size={10} className="ml-auto opacity-70 shrink-0" />}
                                      </div>
                                 )})}
                             </div>
                        </div>
                    );
                })}
            </div>
        )}
      </div>
      
      {effectiveViewMode === 'AGENDA' && selectedEventIds.size > 0 && !isSidebar && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl p-2 shadow-2xl animate-in slide-in-from-bottom-5 flex items-center gap-2 w-auto justify-between border border-gray-700 dark:border-gray-200">
                <div className="font-bold px-2 text-sm hidden sm:block whitespace-nowrap">{selectedEventIds.size} selected</div>
                
                <div className="flex gap-2 items-center w-full sm:w-auto justify-between sm:justify-end">
                     <div>
                        <button type="button" onClick={() => setShowManageUsersModal(true)} className="bg-gray-700 dark:bg-gray-200 hover:bg-gray-600 dark:hover:bg-gray-300 text-white dark:text-gray-900 px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-2"><Users size={16} /> <span className="hidden sm:inline">{t('calendar.manage_participants')}</span></button>
                     </div>

                     <button type="button" onClick={handleBulkDeleteClick} className={`w-12 sm:w-24 px-0 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 bg-gray-700 dark:bg-gray-200 text-red-300 dark:text-red-700 hover:bg-gray-600 dark:hover:bg-gray-300`}>
                        <Trash2 size={16} /> <span className="hidden sm:inline">{t('calendar.delete_bulk')}</span>
                     </button>
                </div>
            </div>
        )}

      {showManageUsersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowManageUsersModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">{t('calendar.manage_participants')}</h3>
                    <button onClick={() => setShowManageUsersModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"><X size={18} className="text-gray-500 dark:text-gray-400"/></button>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-[0.65rem] text-blue-700 dark:text-blue-300 text-center font-medium border-b border-blue-100 dark:border-blue-800">
                    {t('calendar.tap_to_toggle')}
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-y-6 gap-x-2">
                        {users.map(u => {
                            const selectedEvents = events.filter(e => selectedEventIds.has(e.id));
                            const allHaveUser = selectedEvents.every(e => e.userIds.includes(u.id));
                            const someHaveUser = !allHaveUser && selectedEvents.some(e => e.userIds.includes(u.id));
                            const isAssigned = allHaveUser;

                            return (
                                <button key={u.id} onClick={() => handleToggleUserInBulk(u.id)} className="flex flex-col items-center gap-2 group relative">
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all border-4 shadow-sm ${isAssigned ? 'scale-105 opacity-100 border-gray-100 dark:border-gray-700' : 'scale-100 opacity-60 grayscale hover:opacity-100 hover:grayscale-0'}`} style={{ borderColor: getUserColor(u) }}>
                                        {u.photoUrl ? <img src={u.photoUrl} alt="" className="w-full h-full object-cover rounded-full" /> : u.avatar}
                                        
                                        {isAssigned && (
                                            <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full p-0.5 border-2 border-white dark:border-gray-800">
                                                <Check size={10} strokeWidth={4} />
                                            </div>
                                        )}
                                        {someHaveUser && !isAssigned && (
                                             <div className="absolute -top-1 -right-1 bg-gray-400 text-white rounded-full w-4 h-4 flex items-center justify-center border-2 border-white dark:border-gray-800 text-[0.6rem] font-bold">
                                                ~
                                            </div>
                                        )}
                                    </div>
                                    <span className={`text-[0.65rem] font-bold truncate w-full text-center ${isAssigned ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}>{u.username.split(' ')[0]}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Portal for Drag Error Tooltip - Floats above everything */}
      {tooltipState && createPortal(
          <div 
            className="fixed z-[9999] pointer-events-none animate-in zoom-in-95 fade-in duration-200"
            style={{ 
                left: tooltipState.x, 
                top: tooltipState.y,
                transform: 'translateX(-50%)'
            }}
          >
             <div className="relative bg-gray-900 dark:bg-red-600 text-white text-[0.65rem] font-bold px-3 py-2 rounded-lg shadow-xl text-center max-w-[200px] border border-gray-700 dark:border-red-500">
                 <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900 dark:border-b-red-600"></div>
                 {t('calendar.drag_recurrence_error')}
             </div>
          </div>,
          document.body
      )}
    </div>
  );
};

export default Calendar;