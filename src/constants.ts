

import { User, SystemSettings, ShoppingItem, ShoppingCategory, ShoppingStore, TodoItem, CalendarEvent, UserPreferences } from './types';

// Helper for consistent Date String generation (YYYY-MM-DD) based on Local Time
export const toLocalDateString = (date: Date): string => {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// Tableau 10
export const PALETTE_STANDARD = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', 
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'
];

// Colorblind Safe (Paul Tol / Wong)
export const PALETTE_ACCESSIBILITY = [
  '#332288', '#88CCEE', '#44AA99', '#117733', '#999933', 
  '#DDCC77', '#CC6677', '#882255', '#AA4499', '#661100'
];

// Google Material 500s (Vibrant)
export const PALETTE_MATERIAL = [
  '#F44336', // Red
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#673AB7', // Deep Purple
  '#3F51B5', // Indigo
  '#2196F3', // Blue
  '#009688', // Teal
  '#4CAF50', // Green
  '#FF9800', // Orange
  '#607D8B', // Blue Grey
];

// Soft Pastel (Calm)
export const PALETTE_PASTEL = [
  '#FFB7B2', // Soft Red
  '#FFDAC1', // Soft Orange
  '#E2F0CB', // Soft Green
  '#B5EAD7', // Mint
  '#C7CEEA', // Periwinkle
  '#F8BBD0', // Pink
  '#E1BEE7', // Lavender
  '#B2EBF2', // Cyan
  '#DCEDC8', // Light Green
  '#FFE0B2', // Peach
];

export const PALETTES = {
  STANDARD: PALETTE_STANDARD,
  ACCESSIBILITY: PALETTE_ACCESSIBILITY,
  MATERIAL: PALETTE_MATERIAL,
  PASTEL: PALETTE_PASTEL
};

export type PaletteKey = keyof typeof PALETTES;

const DEFAULT_PREFERENCES: UserPreferences = {
  showWeather: true,
  showMoonPhases: true,
  showHolidays: true,
  theme: 'LIGHT'
};

export const MOCK_USERS: User[] = [
  { id: 'u1', username: 'Dad', colorIndex: 0, avatar: '👨', isAdmin: true, fontSizeScale: 1, preferences: DEFAULT_PREFERENCES }, 
  { id: 'u2', username: 'Mom', colorIndex: 2, avatar: '👩', isAdmin: true, fontSizeScale: 1, preferences: DEFAULT_PREFERENCES }, 
  { id: 'u3', username: 'Kid 1', colorIndex: 4, avatar: '👦', isAdmin: false, fontSizeScale: 1, preferences: DEFAULT_PREFERENCES }, 
  { id: 'u4', username: 'Kid 2', colorIndex: 5, avatar: '👧', isAdmin: false, fontSizeScale: 1, preferences: DEFAULT_PREFERENCES }, 
];

export const INITIAL_STORES: ShoppingStore[] = [
    { id: 'store1', name: 'Grocery Store', order: 0 },
    { id: 'store2', name: 'Big Box / Hardware', order: 1 }
];

export const INITIAL_CATEGORIES: ShoppingCategory[] = [
    // Grocery Store Categories - explicitly linked
    { id: 'c1', name: 'Produce', storeId: 'store1', order: 0 },
    { id: 'c2', name: 'Dairy & Eggs', storeId: 'store1', order: 1 },
    { id: 'c3', name: 'Meat', storeId: 'store1', order: 2 },
    { id: 'c4', name: 'Pantry', storeId: 'store1', order: 3 },
    { id: 'c5', name: 'Frozen', storeId: 'store1', order: 4 },
    // Hardware/Big Box Categories
    { id: 'c6', name: 'Household', storeId: 'store2', order: 1 },
    { id: 'c7', name: 'Garden', storeId: 'store2', order: 2 },
];

export const INITIAL_SHOPPING: ShoppingItem[] = [
  { 
      id: 's1', 
      content: 'Milk', 
      note: '2% Organic', 
      isInCart: false, 
      addedByUserId: 'u1', 
      addedAt: new Date().toISOString(),
      userCategoryIds: { 'u1': 'c2', 'u2': 'c2', 'u3': 'c2', 'u4': 'c2' },
      userPriorities: { 'u1': 'NORMAL' },
      seenByUserIds: ['u1', 'u2', 'u3', 'u4'],
      creatorCategoryId: 'c2',
      logs: []
  },
  { 
      id: 's2', 
      content: 'Eggs', 
      isInCart: true, 
      addedByUserId: 'u2', 
      addedAt: new Date().toISOString(),
      userCategoryIds: { 'u1': 'c2', 'u2': 'c2', 'u3': 'c2', 'u4': 'c2' },
      userPriorities: { 'u2': 'NORMAL' },
      seenByUserIds: ['u1', 'u2', 'u3', 'u4'],
      creatorCategoryId: 'c2',
      logs: []
  },
];

export const INITIAL_TODOS: TodoItem[] = [
  { 
    id: 't1', 
    content: 'Pay bills', 
    note: 'Electricity and Internet',
    isCompleted: false, 
    userId: 'u1', 
    deadline: new Date().toISOString(),
    priority: 'URGENT',
    isPrivate: true 
  },
  { 
    id: 't2', 
    content: 'Call Mom', 
    isCompleted: false, 
    userId: 'u2', 
    priority: 'NORMAL',
    isPrivate: true 
  }
];

export const INITIAL_EVENTS: CalendarEvent[] = [
  { 
    id: 'e1', 
    title: 'Soccer Practice', 
    description: 'Bring the orange snacks',
    startTime: new Date(new Date().setHours(17, 0, 0, 0)).toISOString(), 
    endTime: new Date(new Date().setHours(18, 30, 0, 0)).toISOString(), 
    userIds: ['u3'],
    isAllDay: false
  },
  { 
    id: 'e2', 
    title: 'Grocery Run', 
    description: 'Weekly haul',
    startTime: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString(), 
    endTime: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString(), 
    userIds: ['u1', 'u2'], // Shared event example
    isAllDay: true
  }
];

export const DEFAULT_SETTINGS: SystemSettings = {
  weatherEnabled: true,
  weatherLocationStr: '', 
  weatherLat: undefined,
  weatherLon: undefined,
  holidaysEnabled: true,
  holidayCountryCode: 'US',
  holidaySubdivisionCode: '',
  lastHolidayFetch: undefined,
  lastHolidayParams: ''
};