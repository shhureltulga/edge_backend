"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/devices/testRegister.ts
const deviceRegister_1 = require("../services/deviceRegister");
(0, deviceRegister_1.registerDeviceToMain)({
    deviceKey: 'lr_temp_3',
    siteId: '2f434df4-87ef-4245-a956-024da2da5a10',
    name: 'Living Temp',
    type: 'sensor',
    domain: 'sensor',
    deviceClass: 'temperature',
    roomId: 'R-LR',
    floorId: 'F1',
    pos: { anchor: 'ceiling', u: 0.4, v: 0.3, h: 2.3 }
});
