/// <reference path="../pb_data/types.d.ts" />

console.log("[-] Loading main.pb.js...");

// -------------------------------------------------------------------------
// 1. HOOK: Handle First Run & Security
// -------------------------------------------------------------------------
onRecordCreateRequest((e) => {
    try {
        const result = new DynamicModel({ "total": 0 });
        $app.db().select("count(*) as total").from("users").one(result);
        const totalUsers = parseInt(result.total);

        // CASE 1: First Run (0 users) -> Auto-make Admin
        if (totalUsers === 0) {
            e.record.set("isAdmin", true);
            return e.next(); 
        }

        // CASE 2: Normal Run -> Check Permissions
        const authRecord = e.auth; 

        if (!authRecord) {
            throw new ForbiddenError("Registration is closed (No Auth).");
        }

        if (!authRecord.getBool("isAdmin")) {
            throw new ForbiddenError("Registration is closed (Not Admin).");
        }

        return e.next();

    } catch (err) {
        $app.logger().error("Hook Error", err);
        throw err;
    }
}, "users");


// -------------------------------------------------------------------------
// 2. ROUTE: App Status 
// -------------------------------------------------------------------------
routerAdd("GET", "/api/app_status", (c) => {
    try {
        const result = new DynamicModel({ "total": 0 });
        $app.db().select("count(*) as total").from("users").one(result);
        
        return c.json(200, { 
            setupRequired: parseInt(result.total) === 0 
        });
    } catch (e) {
        return c.json(200, { setupRequired: false });
    }
});