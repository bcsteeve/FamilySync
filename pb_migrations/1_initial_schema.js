
/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  console.log("[Migration] Starting Schema Update...");

  // -------------------------------------------------------
  // 1. EXTEND USERS COLLECTION
  // -------------------------------------------------------
  const users = app.findCollectionByNameOrId("users");

  // --- SECURITY RULES ---
  
  // FIX 1: Set to "" (Empty String) = PUBLIC
  // Allows anonymous users to attempt creation.
  // Your 'main.pb.js' Hook will intercept this and block everyone except the first user.
  users.createRule = ""; 

  // FIX 2: Set to "" (Empty String) = PUBLIC
  // Allows the frontend to receive the user object immediately after creation.
  // If this is restrictive, the creation succeeds (DB write) but the UI crashes (Read fail).
  users.listRule = "@request.auth.id != ''";

  // PRIVACY: Keep List/Update/Delete restricted
  users.listRule = "@request.auth.id != ''"; // Only logged-in users can list
  users.updateRule = "id = @request.auth.id || @request.auth.isAdmin = true";
  users.deleteRule = "@request.auth.isAdmin = true";
  users.manageRule = "@request.auth.isAdmin = true";
  
  // --- FIELDS ---
  users.fields.add(new Field({ name: "emoji", type: "text" }));
  users.fields.add(new Field({ name: "colorIndex", type: "number" }));
  users.fields.add(new Field({ name: "isAdmin", type: "bool" }));
  users.fields.add(new Field({ name: "preferences", type: "json" }));
  users.fields.add(new Field({ name: "fontSizeScale", type: "number" }));

  app.save(users);

  // -------------------------------------------------------
  // 2. EVENTS
  // -------------------------------------------------------
  const events = new Collection({
    name: "events",
    type: "base",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''"
  });

  events.fields.add(new Field({ name: "title", type: "text", required: true }));
  events.fields.add(new Field({ name: "description", type: "text" }));
  events.fields.add(new Field({ name: "startTime", type: "date", required: true }));
  events.fields.add(new Field({ name: "endTime", type: "date" }));
  events.fields.add(new Field({ name: "isAllDay", type: "bool" }));
  // REPLACED: JSON recurrence with Standard RRULE text
  events.fields.add(new Field({ name: "rrule", type: "text" }));
  events.fields.add(new Field({ name: "icalUID", type: "text" }));
  events.fields.add(new Field({ name: "exdates", type: "json" }));
  events.fields.add(new Field({ name: "participants", type: "relation", collectionId: users.id, maxSelect: 999 }));
  events.fields.add(new Field({ name: "created", type: "autodate", onCreate: true, onUpdate: false}));
  events.fields.add(new Field({ name: "updated", type: "autodate", onCreate: true, onUpdate: true}));
  
  app.save(events);

  // -------------------------------------------------------
  // 3. STORES
  // -------------------------------------------------------
  const stores = new Collection({
    name: "shopping_stores",
    type: "base",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.isAdmin = true",
    updateRule: "@request.auth.isAdmin = true",
    deleteRule: "@request.auth.isAdmin = true"
  });
  stores.fields.add(new Field({ name: "name", type: "text", required: true }));
  stores.fields.add(new Field({ name: "order", type: "number" }));
  stores.fields.add(new Field({ name: "created", type: "autodate", onCreate: true, onUpdate: false}));
  stores.fields.add(new Field({ name: "updated", type: "autodate", onCreate: true, onUpdate: true}));
  
  app.save(stores);

  // -------------------------------------------------------
  // 4. CATEGORIES
  // -------------------------------------------------------
  const categories = new Collection({
    name: "shopping_categories",
    type: "base",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''"
  });
  categories.fields.add(new Field({ name: "name", type: "text", required: true }));
  categories.fields.add(new Field({ name: "order", type: "number" }));
  categories.fields.add(new Field({ name: "storeId", type: "relation", collectionId: stores.id, maxSelect: 1 }));
  categories.fields.add(new Field({ name: "created", type: "autodate", onCreate: true, onUpdate: false}));
  categories.fields.add(new Field({ name: "updated", type: "autodate", onCreate: true, onUpdate: true}));
  
  app.save(categories);

  // -------------------------------------------------------
  // 5. SHOPPING ITEMS
  // -------------------------------------------------------
  const shopping = new Collection({
    name: "shopping_items",
    type: "base",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''"
  });
  shopping.fields.add(new Field({ name: "content", type: "text", required: true }));
  shopping.fields.add(new Field({ name: "note", type: "text" }));
  shopping.fields.add(new Field({ name: "isInCart", type: "bool" }));
  shopping.fields.add(new Field({ name: "isPrivate", type: "bool" }));
  shopping.fields.add(new Field({ name: "priority", type: "select", values: ["LOW", "NORMAL", "URGENT"] }));
  shopping.fields.add(new Field({ name: "order", type: "number" }));
  shopping.fields.add(new Field({ name: "category", type: "text" }));
  shopping.fields.add(new Field({ name: "userCategoryIds", type: "json" }));
  shopping.fields.add(new Field({ name: "addedBy", type: "relation", collectionId: users.id, maxSelect: 1 }));
  shopping.fields.add(new Field({ name: "seenBy", type: "relation", collectionId: users.id, maxSelect: 999 }));
  shopping.fields.add(new Field({ name: "logs", type: "json" }));
  shopping.fields.add(new Field({ name: "created", type: "autodate", onCreate: true, onUpdate: false}));
  shopping.fields.add(new Field({ name: "updated", type: "autodate", onCreate: true, onUpdate: true}));
  
  app.save(shopping);

  // -------------------------------------------------------
  // 6. TODOS
  // -------------------------------------------------------
  const todos = new Collection({
    name: "todos",
    type: "base",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''"
  });
  todos.fields.add(new Field({ name: "content", type: "text", required: true }));
  todos.fields.add(new Field({ name: "note", type: "text" }));
  todos.fields.add(new Field({ name: "isCompleted", type: "bool" }));
  todos.fields.add(new Field({ name: "isPrivate", type: "bool" }));
  todos.fields.add(new Field({ name: "priority", type: "select", values: ["LOW", "NORMAL", "URGENT"] }));
  todos.fields.add(new Field({ name: "deadline", type: "date" }));
  todos.fields.add(new Field({ name: "userId", type: "relation", collectionId: users.id, maxSelect: 1 }));
  todos.fields.add(new Field({ name: "created", type: "autodate", onCreate: true, onUpdate: false}));
  todos.fields.add(new Field({ name: "updated", type: "autodate", onCreate: true, onUpdate: true}));
  
  app.save(todos);

  // -------------------------------------------------------
  // 7. SETTINGS
  // -------------------------------------------------------
  const settings = new Collection({
    name: "system_settings",
    type: "base",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.isAdmin = true",
    updateRule: "@request.auth.isAdmin = true",
    deleteRule: null
  });
  settings.fields.add(new Field({ name: "weatherEnabled", type: "bool" }));
  settings.fields.add(new Field({ name: "weatherLocationStr", type: "text" }));
  settings.fields.add(new Field({ name: "weatherLat", type: "number" }));
  settings.fields.add(new Field({ name: "weatherLon", type: "number" }));
  settings.fields.add(new Field({ name: "holidaysEnabled", type: "bool" }));
  settings.fields.add(new Field({ name: "holidayCountryCode", type: "text" }));
  settings.fields.add(new Field({ name: "holidaySubdivisionCode", type: "text" }));
  settings.fields.add(new Field({ name: "paletteKey", type: "text" }));
  settings.fields.add(new Field({ name: "lastHolidayFetch", type: "text" }));
  settings.fields.add(new Field({ name: "lastHolidayParams", type: "text" }));
  settings.fields.add(new Field({ name: "created", type: "autodate", onCreate: true, onUpdate: false}));
  settings.fields.add(new Field({ name: "updated", type: "autodate", onCreate: true, onUpdate: true}));
  
  app.save(settings);

  console.log("[Migration] Full Schema Update Complete.");

}, (app) => {
  // Down Migration
});