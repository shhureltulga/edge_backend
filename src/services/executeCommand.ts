import { ensureAreaByName } from '../utils/ha';
import { prisma } from '../lib/prisma';

// Минимал жишээ — MQTT байхгүй бол логлоно, байгаа тохиолдолд publish хийнэ.
export interface EdgeCommandInput {
  id: string;         // main id (ACK-д)
  type: string;       // light.set ...
  deviceKey: string;  // main_light ...
  room?: {
    id: string;
    name: string;
  };
  [k: string]: any;   // on, brightness, ...
  
}

export async function executeCommand(cmd: EdgeCommandInput): Promise<void> {
  console.log(`[EXEC] ${cmd.type} -> ${cmd.deviceKey}`);

  switch (cmd.type) {
    case 'light.set': {
      const payload = JSON.stringify({
        on: cmd.on === undefined ? true : !!cmd.on,
        brightness: typeof cmd.brightness === 'number' ? cmd.brightness : 100,
      });
      const topic = `edge/${cmd.deviceKey}/set`;

      // Хэрэв MQTT client байгаа бол:
      // await mqttClient.publish(topic, payload);
      console.log(`[MQTT] ${topic} <- ${payload}`);
      return;
    }
   case 'ha.area.ensure': {
      const { room } = cmd;
      const areaName = room?.name;
      if (!areaName) {
        console.warn('[ha.area.ensure] Missing room name');
        return;
      }

      try {
        const haArea = await ensureAreaByName(areaName);

        // ✅ Room нь edge DB-д байхгүй тул зөвхөн лог хийе
        console.log(`[ha.area.ensure] Synced HA area for room "${areaName}": ${haArea.area_id}`);

        // ❌ prisma.room.update байхгүй — main талд update болно
      } catch (e) {
        console.error('[ha.area.ensure] Error syncing HA area:', e);
      }
      return;
    }

    // өөр төрлүүдийг энд үргэлжлүүлээрэй...

    default:
      console.warn('[EXEC] unknown type:', cmd.type);
      return;
  }
}
