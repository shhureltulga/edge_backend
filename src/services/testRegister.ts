// src/devices/testRegister.ts
import { registerDeviceToMain } from '../services/deviceRegister';

registerDeviceToMain({
  deviceKey: 'lr_temp_1',
  siteId: '2f434df4-87ef-4245-a956-024da2da5a10',
  name: 'Living Temp',
  type: 'sensor',
  domain: 'sensor',
  deviceClass: 'temperature',
  roomId: 'R-LR',
  floorId: 'F1',
  pos: { anchor: 'ceiling', u: 0.4, v: 0.3, h: 2.3 }
});
