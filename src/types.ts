

export interface UserPreferences {
  showWeather: boolean;
  showMoonPhases: boolean;
  showHolidays: boolean;
  theme: 'LIGHT' | 'DARK';
  timeFormat?: '12h' | '24h';
  language?: string;
}

export interface User {
  id: string;
  username: string;
  colorIndex: number; // 0-9 Index into the active palette
  avatar: string; // Emoji
  photoUrl?: string; // Optional real Google profile image
  isAdmin?: boolean; 
  fontSizeScale?: number; // 1.0 = Normal (100%)
  preferences?: UserPreferences;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO String
  endTime?: string; // ISO String
  isAllDay?: boolean;
  userIds: string[];
  rrule?: string; // Standard iCal Recurrence Rule (e.g. "FREQ=WEEKLY;BYDAY=TU")
  icalUID?: string; // External Unique ID for import/export deduplication
  exdates?: string[]; // Array of ISO Date strings (YYYY-MM-DD) to skip
}

export type PriorityLevel = 'LOW' | 'NORMAL' | 'URGENT';

export interface TodoItem {
  id: string;
  content: string;
  note?: string;
  deadline?: string; // ISO String
  priority?: PriorityLevel;
  isCompleted: boolean;
  userId: string;
  isPrivate?: boolean;
}

export interface ShoppingStore {
  id: string;
  name: string;
  order: number;
}

export interface ShoppingCategory {
  id: string;
  name: string;
  storeId?: string; // Optional linkage to a store
  order: number;
}

export type ShoppingLogType = 'CREATE' | 'UPDATE' | 'COMPLETE' | 'RESTORE';

export interface ShoppingLogEntry {
  id: string;
  type: ShoppingLogType;
  userId: string;
  timestamp: string; // ISO String
  details?: string; // e.g. "Renamed to 'Cookies'", "Marked Urgent"
}

export interface ShoppingItem {
  id: string;
  content: string;
  note?: string;
  isInCart: boolean;
  addedByUserId: string;
  addedAt: string; // ISO String
  isPrivate?: boolean;
  
  // Per-User State maps (UserId -> Value)
  userCategoryIds?: Record<string, string>; 
  
  // Global State
  order: number;

  // New Item Tracking
  seenByUserIds?: string[]; 
  
  // Suggestion System
  creatorCategoryId?: string; // The category intended by the creator
  
  // Audit
  completedByUserId?: string;
  completedAt?: string; // ISO String
  logs?: ShoppingLogEntry[];

  // Legacy fields
  categoryId?: string; 
  priority?: PriorityLevel;
}

export enum AppView {
  CALENDAR = 'CALENDAR',
  LISTS = 'LISTS',
  SETTINGS = 'SETTINGS'
}

export interface SmartParseResult {
  type: 'EVENT' | 'TODO' | 'SHOPPING';
  data: any;
}

export interface SystemSettings {
  weatherEnabled: boolean; // Acts as a master toggle for fetching
  weatherLocationStr: string; 
  weatherLat?: number;
  weatherLon?: number;
  
  holidaysEnabled: boolean; // Master toggle for fetching
  holidayCountryCode: string; 
  holidaySubdivisionCode?: string; 
  
  // Caching mechanism
  lastHolidayFetch?: string; // ISO Timestamp of last successful fetch
  lastHolidayParams?: string; // Composite key "Country|Subdivision" to detect config changes
}