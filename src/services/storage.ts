import { pb } from './pb';
import { CalendarEvent, ShoppingItem, TodoItem, User, SystemSettings, ShoppingStore, ShoppingCategory } from '../types';
import { DEFAULT_SETTINGS, PaletteKey } from '../constants';

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
    for (const u of users) {
        try {
            // MAP UPDATE:
            // We map u.avatar (Frontend Emoji) -> DB 'emoji'
            // We do NOT map u.photoUrl here because file uploads require FormData, 
            // and this function receives a string URL. File uploads are handled separately 
            // (or would need to be if implemented in Settings).
            
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

          const records = await pb.collection('events').getFullList({ 
              sort: '-startTime',
              filter: `recurrence != null || startTime >= "${dateStr}"`
          });

          return records.map((r: any) => ({
              id: r.id,
              title: r.title,
              description: r.description,
              startTime: r.startTime,
              endTime: r.endTime,
              isAllDay: r.isAllDay,
              userIds: r.participants || [], 
              recurrence: r.recurrence,
              exdates: r.exdates
          }));
      } catch (e) { return []; }
  }

	createEvent = async (event: CalendarEvent): Promise<CalendarEvent> => {
		const { id, ...payload } = event;

		const record = await pb.collection('events').create({
			...payload,
			participants: event.userIds
		});
		
		return { ...event, id: record.id };
	}

  updateEvent = async (event: CalendarEvent): Promise<void> => {
      await pb.collection('events').update(event.id, {
          ...event,
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
            userPriorities: { [r.addedBy]: r.priority },
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
          priority: 'NORMAL', 
          category: item.creatorCategoryId,
		  userCategoryIds: item.userCategoryIds
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
          priority: item.userPriorities?.[item.addedByUserId] || 'NORMAL',
          category: item.creatorCategoryId,
		  userCategoryIds: item.userCategoryIds
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