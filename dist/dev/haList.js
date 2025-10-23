"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ha_1 = require("../utils/ha");
(async () => {
    const areas = await (0, ha_1.listAreas)();
    console.log('HA areas:', areas.map(a => a.name));
})();
