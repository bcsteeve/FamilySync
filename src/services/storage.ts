import { pb } from './pb';
import { CalendarEvent, ShoppingItem, TodoItem, User, SystemSettings, ShoppingStore, ShoppingCategory } from '../types';
import { DEFAULT_SETTINGS, PaletteKey } from '../constants';
import { createRRule } from './recurrence';

class StorageService {
  public get pb() { return pb; }

  // --- Helpers ---
  private mapUser(record: any): User {
      // 1. MAPPING STRATEGY:
      // DB 'avatar' (File) -> Frontend 'photoUrl'
      // DB 'emoji' (Text)  -> Frontend 'avatar'
      
      const avatarFile = record.avatar; // The file filename
      const photoUrl = avatarFile 
  ? pb.files.getURL(record, avatarFile, { thumb: '100x100' }) 
  : undefined;

      return {
          id: record.id,
          username: record.name || record.username, 
          colorIndex: record.colorIndex || 0,
          
          // MAP EMOJI:
          avatar: record.emoji || '🙂', 
          
          // MAP FILE:
          photoUrl: photoUrl,
          
          isAdmin: record.isAdmin || false, 
          fontSizeScale: record.fontSizeScale || 1,
          preferences: record.preferences || {}
      };
  }

  // --- Session Management ---
  getAuthUser(): string | null {
      return pb.authStore.isValid && pb.authStore.model ? pb.authStore.model.id : null;
  }

  // --- Auth / Setup ---
  async registerUser(username: string, password: string): Promise<User> {
      let email: string;
      let slug: string;
      
      if (username.includes('@')) {
          email = username;
          slug = username.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      } else {
          slug = username.toLowerCase().replace(/[^a-z0-9]/g, '');
          email = `${slug}@familysync.local`;
      }
      
      const record = await pb.collection('users').create({
          username: slug, 
          name: username,
          email: email,
          emailVisibility: true,
          password: password,
          passwordConfirm: password,
          
          // MAP EMOJI ON CREATE:
          emoji: '👑', // Default admin emoji
          
          colorIndex: 0,
          fontSizeScale: 1,
          isAdmin: true, 
          preferences: { theme: 'LIGHT', showWeather: true }
      });
      
      await pb.collection('users').authWithPassword(email, password);
      return this.mapUser(record);
  }

  async loginUser(username: string, password: string): Promise<User> {
      let emailToUse = username;
      if (!username.includes('@')) {
          const slug = username.toLowerCase().replace(/[^a-z0-9]/g, '');
          emailToUse = `${slug}@familysync.local`;
      }
      
      const authData = await pb.collection('users').authWithPassword(emailToUse, password);
      return this.mapUser(authData.record);
  }

  async createFamilyMember(username: string, password: string): Promise<User> {
      let email: string;
      let slug: string;
      
      if (username.includes('@')) {
          email = username;
          slug = username.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      } else {
          slug = username.toLowerCase().replace(/[^a-z0-9]/g, '');
          email = `${slug}@familysync.local`;
      }
      
      const record = await pb.collection('users').create({
          username: slug, 
          name: username,
          email: email,
          emailVisibility: true,
          password: password,
          passwordConfirm: password,
          
          // MAP EMOJI ON CREATE:
          emoji: '🙂',
          
          colorIndex: Math.floor(Math.random() * 10),
          fontSizeScale: 1,
          isAdmin: false, 
          preferences: { theme: 'LIGHT', showWeather: true }
      });
      return this.mapUser(record);
  }

async updateUserPassword(userId: string, newPass: string, oldPass?: string): Promise<void> {
    // The "Manage" API rule (@request.auth.isAdmin = true) allows admins 
    // to update passwords without the oldPassword.
    
    const payload: any = {
        password: newPass,
        passwordConfirm: newPass,
    };

    // If it's a self-update, we might still provide the old one, 
    // though the Manage rule makes it optional for admins.
    if (oldPass) {
        payload.oldPassword = oldPass;
    }

    await pb.collection('users').update(userId, payload);
}

  // --- Users ---
  async getUsers(): Promise<User[]> {
    try {
        const records = await pb.collection('users').getFullList({ sort: 'created' });
        return records.map(r => this.mapUser(r));
    } catch (e) { return []; }
  }

  async saveUsers(users: User[]): Promise<void> {
    // 1. Fetch existing users to detect deletions
    const existingUsers = await this.getUsers();
    const newIds = new Set(users.map(u => u.id));

    // 2. Delete users missing from the new list
    for (const existing of existingUsers) {
        if (!newIds.has(existing.id)) {
            try {
                await pb.collection('users').delete(existing.id);
            } catch (e) {
                console.error(`Failed to delete user ${existing.id}`, e);
            }
        }
    }

    // 3. Update/Create remaining users
    for (const u of users) {
        try {
            // MAP UPDATE:
            // We map u.avatar (Frontend Emoji) -> DB 'emoji'
            await pb.collection('users').update(u.id, {
                name: u.username,
                colorIndex: u.colorIndex,
                emoji: u.avatar, // Save text emoji
                fontSizeScale: u.fontSizeScale,
                preferences: u.preferences,
                isAdmin: u.isAdmin
            });
        } catch (e) { console.error(e); }
    }
  }

// --- Avatar Handling ---
  async uploadAvatar(userId: string, file: File): Promise<User> {
      const formData = new FormData();
      formData.append('avatar', file);
      
      const record = await pb.collection('users').update(userId, formData);
      return this.mapUser(record);
  }

  async deleteAvatar(userId: string): Promise<User> {
      // Sending null deletes the file
      const record = await pb.collection('users').update(userId, { avatar: null });
      return this.mapUser(record);
  }
  // I will include the Events/Shopping/etc getters below for completeness to ensure you have a valid file.

  // --- Events (Optimized) ---
  async getEvents(): Promise<CalendarEvent[]> {
      try {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const dateStr = oneYearAgo.toISOString();

          // We fetch events that have an RRULE (recurring) OR are in the future/recent past
          const records = await pb.collection('events').getFullList({ 
              sort: '-startTime',
              filter: `rrule != "" || startTime >= "${dateStr}"`
          });

          return records.map((r: any) => {
              // MIGRATION ON READ: Convert Legacy JSON to RRULE
              let effectiveRRule = r.rrule;
              if (!effectiveRRule && r.recurrence && r.recurrence.freq) {
                  effectiveRRule = createRRule(
                      r.recurrence.freq, 
                      new Date(r.startTime), 
                      r.recurrence.until ? new Date(r.recurrence.until) : undefined
                  );
              }

              return {
                  id: r.id,
                  title: r.title,
                  description: r.description,
                  startTime: r.startTime,
                  endTime: r.endTime,
                  isAllDay: r.isAllDay,
                  userIds: r.participants || [], 
                  rrule: effectiveRRule, // Use the new string field
                  icalUID: r.icalUID,
                  exdates: r.exdates
              };
          });
      } catch (e) { return []; }
  }

	createEvent = async (event: CalendarEvent): Promise<CalendarEvent> => {
		const { id, ...payload } = event;
        // Strip legacy recurrence field if present to keep DB clean
        const { recurrence, ...cleanPayload } = payload as any;

		const record = await pb.collection('events').create({
			...cleanPayload,
			participants: event.userIds
		});
		
		return { ...event, id: record.id };
	}

  updateEvent = async (event: CalendarEvent): Promise<void> => {
      const { recurrence, ...cleanPayload } = event as any;
      await pb.collection('events').update(event.id, {
          ...cleanPayload,
          participants: event.userIds
      });
  }

  deleteEvent = async (id: string): Promise<void> => {
      await pb.collection('events').delete(id);
  }

  // --- Shopping ---
  async getShopping(): Promise<ShoppingItem[]> {
      try {
        const records = await pb.collection('shopping_items').getFullList({ sort: '-created' });
        return records.map((r: any) => ({
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
            logs: [] 
        } as ShoppingItem));
      } catch (e) { return []; }
  }

createShoppingItem = async (item: ShoppingItem): Promise<ShoppingItem> => {
      const record = await pb.collection('shopping_items').create({
          content: item.content,
          note: item.note,
          isInCart: item.isInCart,
          isPrivate: item.isPrivate,
          addedBy: item.addedByUserId,
          seenBy: item.seenByUserIds,
          priority: item.priority || 'NORMAL',
          order: item.order,
          category: item.creatorCategoryId,
		  userCategoryIds: item.userCategoryIds,
          logs: item.logs
      });
      return { ...item, id: record.id };
  }

  updateShoppingItem = async (item: ShoppingItem): Promise<void> => {
      await pb.collection('shopping_items').update(item.id, {
          content: item.content,
          note: item.note,
          isInCart: item.isInCart,
          isPrivate: item.isPrivate,
          seenBy: item.seenByUserIds,
          priority: item.priority || 'NORMAL',
          order: item.order,
          category: item.creatorCategoryId,
		  userCategoryIds: item.userCategoryIds,
          logs: item.logs
      });
  }
  deleteShoppingItem = async (id: string): Promise<void> => {
      await pb.collection('shopping_items').delete(id);
  }

  // --- Todos ---
  async getTodos(): Promise<TodoItem[]> {
      try {
        const records = await pb.collection('todos').getFullList({ sort: '-created' });
        return records.map((r: any) => ({
            id: r.id,
            content: r.content,
            note: r.note,
            isCompleted: r.isCompleted,
            userId: r.userId,
            priority: r.priority,
            deadline: r.deadline,
            isPrivate: r.isPrivate
        }));
      } catch (e) { return []; }
  }

	createTodo = async (item: TodoItem): Promise<TodoItem> => {
		const { id, ...payload } = item;

		const record = await pb.collection('todos').create({
			...payload,
			userId: item.userId
		});
		return { ...item, id: record.id };
}

  updateTodo = async (item: TodoItem): Promise<void> => {
      await pb.collection('todos').update(item.id, {
          ...item,
          userId: item.userId
      });
  }

  deleteTodo = async (id: string): Promise<void> => {
      await pb.collection('todos').delete(id);
  }

  // --- Stores & Categories ---
  async getStores(): Promise<ShoppingStore[]> {
      try {
          const records = await pb.collection('shopping_stores').getFullList({ sort: 'order' });
          return records.map((r: any) => ({ id: r.id, name: r.name, order: r.order }));
      } catch { return []; }
  }

async saveStores(stores: ShoppingStore[]): Promise<Record<string, string>> {
  const existing = await this.getStores();
  const newIds = new Set(stores.map(s => s.id));
  const idMap: Record<string, string> = {}; // To store Temp -> Real mapping

  for (const e of existing) {
      if (!newIds.has(e.id)) await pb.collection('shopping_stores').delete(e.id);
  }

  for (const s of stores) {
      if (s.id.length < 15) { 
         // 1. Strip Temp ID
         const { id, ...payload } = s;
         // 2. Create
         const record = await pb.collection('shopping_stores').create(payload);
         // 3. Record the Swap
         idMap[s.id] = record.id;
      } else {
         await pb.collection('shopping_stores').update(s.id, s);
      }
  }
  return idMap;
}

  async getCategories(): Promise<ShoppingCategory[]> {
      try {
          const records = await pb.collection('shopping_categories').getFullList({ sort: 'order' });
          return records.map((r: any) => ({ id: r.id, name: r.name, storeId: r.storeId, order: r.order }));
      } catch { return []; }
  }

async saveCategories(cats: ShoppingCategory[]): Promise<Record<string, string>> {
  const existing = await this.getCategories();
  const newIds = new Set(cats.map(c => c.id));
  const idMap: Record<string, string> = {};

  for (const e of existing) {
      if (!newIds.has(e.id)) await pb.collection('shopping_categories').delete(e.id);
  }

  for (const c of cats) {
      if (c.id.length < 15) {
         // 1. Strip Temp ID
         const { id, ...payload } = c;
         const record = await pb.collection('shopping_categories').create(payload);
         // 2. Record the Swap
         idMap[c.id] = record.id;
      } else {
         await pb.collection('shopping_categories').update(c.id, c);
      }
  }
  return idMap;
}

  // --- Settings ---
  async getSettings(): Promise<SystemSettings> {
      try {
          const record = await pb.collection('system_settings').getFirstListItem('');
          return {
              weatherEnabled: record.weatherEnabled,
              weatherLocationStr: record.weatherLocationStr,
              weatherLat: record.weatherLat,
              weatherLon: record.weatherLon,
              holidaysEnabled: record.holidaysEnabled,
              holidayCountryCode: record.holidayCountryCode,
              holidaySubdivisionCode: record.holidaySubdivisionCode,
              lastHolidayFetch: record.lastHolidayFetch,
              lastHolidayParams: record.lastHolidayParams
          };
      } catch {
          return DEFAULT_SETTINGS;
      }
  }

  async saveSettings(settings: SystemSettings): Promise<void> {
      try {
          const record = await pb.collection('system_settings').getFirstListItem('');
          await pb.collection('system_settings').update(record.id, settings);
      } catch {
          await pb.collection('system_settings').create(settings);
      }
  }

  async getPaletteKey(): Promise<PaletteKey> {
      try {
        const record = await pb.collection('system_settings').getFirstListItem('');
        return (record.paletteKey as PaletteKey) || 'STANDARD';
      } catch { return 'STANDARD'; }
  }

  async savePaletteKey(key: PaletteKey): Promise<void> {
       try {
          const record = await pb.collection('system_settings').getFirstListItem('');
          await pb.collection('system_settings').update(record.id, { paletteKey: key });
      } catch { 
          await pb.collection('system_settings').create({ paletteKey: key });
      }
  }
  
  // --- Backups & Holidays Helpers ---
  async getHolidays(): Promise<CalendarEvent[]> {
      const stored = localStorage.getItem('fs_holidays');
      return stored ? JSON.parse(stored) : [];
  } 

  async saveHolidays(holidays: CalendarEvent[]) {
      localStorage.setItem('fs_holidays', JSON.stringify(holidays));
  } 

  // --- Local-First Caching ---
  saveLocal(key: string, data: any) {
      try {
          localStorage.setItem(`fs_cache_${key}`, JSON.stringify(data));
      } catch (e) {
          console.warn(`Failed to save local cache for ${key}`, e);
      }
  }

  loadLocal<T>(key: string, fallback: T): T {
      try {
          const stored = localStorage.getItem(`fs_cache_${key}`);
          return stored ? JSON.parse(stored) : fallback;
      } catch (e) {
          return fallback;
      }
  }

  // --- Mutation Queue ---
  getQueue(): any[] {
      try {
          return JSON.parse(localStorage.getItem('fs_mutation_queue') || '[]');
      } catch { return []; }
  }

  addToQueue(action: { type: string, collection: string, payload: any, tempId?: string }) {
      const queue = this.getQueue();
      queue.push({ ...action, timestamp: Date.now() });
      localStorage.setItem('fs_mutation_queue', JSON.stringify(queue));
  }

  removeFromQueue(timestamp: number) {
      const queue = this.getQueue();
      const updated = queue.filter((i: any) => i.timestamp !== timestamp);
      localStorage.setItem('fs_mutation_queue', JSON.stringify(updated));
  }

  async createBackup(): Promise<any> {
      const [users, events, shopping, todos, settings, stores, categories] = await Promise.all([
          this.getUsers(),
          this.getEvents(),
          this.getShopping(),
          this.getTodos(),
          this.getSettings(),
          this.getStores(),
          this.getCategories()
      ]);
      return { users, events, shopping, todos, settings, stores, categories, date: new Date().toISOString() };
  } 

  async restoreBackup(data: any) {
      if (!data) return;
      if (data.users) await this.saveUsers(data.users);
      if (data.settings) await this.saveSettings(data.settings);
      if (data.stores) await this.saveStores(data.stores);
      if (data.categories) await this.saveCategories(data.categories);

      if (data.events) {
          for (const item of data.events) {
              try { await pb.collection('events').update(item.id, item); } 
              catch { try { await pb.collection('events').create(item); } catch (e) { console.error(e); } }
          }
      }
      if (data.shopping) {
          for (const item of data.shopping) {
              try { await pb.collection('shopping_items').update(item.id, { ...item, addedBy: item.addedByUserId }); } 
              catch { try { await pb.collection('shopping_items').create({ ...item, addedBy: item.addedByUserId }); } catch (e) { console.error(e); } }
          }
      }
      if (data.todos) {
          for (const item of data.todos) {
              try { await pb.collection('todos').update(item.id, item); } 
              catch { try { await pb.collection('todos').create(item); } catch (e) { console.error(e); } }
          }
      }
  } 
}

export const storage = new StorageService();