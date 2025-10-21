// src/index.ts
import express from 'express';
import { PrismaClient, ReadingType } from '@prisma/client';
import mqtt from 'mqtt';
import * as edgeApi from './services/mainClient';
import {
  pushReadings,
  heartbeat as sendHeartbeat,
  fetchCommands,
  ackCommand,
} from './services/mainClient';
import { startHaSyncWorker } from './services/haSync';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

startHaSyncWorker(2000); 
// ---- ENV ----
const PORT = Number(process.env.PORT || 4000);
const EDGE_ID = process.env.EDGE_ID || 'edge_local';
const MQTT_URL = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';

// ---- Helpers ----
const toReadingType = (t: string): ReadingType => {
  const v = (t || '').trim();
  return (Object.values(ReadingType) as string[]).includes(v)
    ? (v as ReadingType)
    : ReadingType.custom;
};


// ---- Healthcheck ----
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, edgeId: EDGE_ID });
  } catch (e) {
    console.error('[HEALTH] DB error:', e);
    res.status(500).json({ ok: false, error: 'db_unreachable' });
  }
});

// ---- Edge → Main heartbeat proxy ----
app.post('/heartbeat', async (req, res) => {
  try {
    const status = req.body?.status === 'offline' ? 'offline' : 'online';
    console.log('[EDGE] heartbeat request:', status);

    await edgeApi.heartbeat(status);

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    const code = e?.response?.status;
    const data = e?.response?.data;
    console.error('[EDGE] heartbeat error:',
      'status=', code,
      'data=', data,
      'message=', e?.message
    );
    return res.status(500).json({
      ok: false,
      error: 'heartbeat_failed',
      detail: data || String(e?.message || e)
    });
  }
});


// ---- HA/MQTT-ээс ирэх датаг (эсвэл гаднаас) авч Main рүү түлхэнэ ----
app.post('/ingest', async (req, res) => {
  try {
    const list = (req.body?.readings ?? []) as Array<{
      deviceKey: string;
      type: string; // temperature | humidity | ...
      value: number;
      ts?: string | Date;
    }>;

    if (!Array.isArray(list) || list.length === 0) {
      return res.json({ ok: true, saved: 0, pushed: 0 });
    }

    // 1) local DB
    await prisma.edgeSensorReading.createMany({
      data: list.map((r) => ({
        edgeId: EDGE_ID,
        deviceKey: r.deviceKey || 'unknown',
        type: toReadingType(r.type),
        value: Number(r.value),
        createdAt: r.ts ? new Date(r.ts) : new Date(),
      })),
    });

    // 2) main backend рүү түлхэх
    await pushReadings(list);

    return res.json({ ok: true, saved: list.length, pushed: list.length });
  } catch (e: any) {
    console.error('[INGEST] error:', e?.response?.status, e?.response?.data || String(e));
    return res.status(500).json({ ok: false, error: 'ingest_failed' });
  }
});

// ---- Start server ----
const server = app.listen(PORT, () => {
  console.log(`EDGE up on :${PORT}`);
});

// ---- MQTT listener (сонголт) ----
let mqttClient: mqtt.MqttClient | null = null;
try {
  mqttClient = mqtt.connect(MQTT_URL);
  mqttClient.on('connect', () => {
    console.log('[MQTT] connected:', MQTT_URL);
    // topic format: edge/<deviceKey>/<type>
    mqttClient!.subscribe('edge/+/+');
  });

  mqttClient.on('message', async (topic, payload) => {
    try {
      const parts = (topic || '').split('/'); // ['edge', '<deviceKey>', '<type>']
      const deviceKey = parts[1] || 'unknown';
      const type = toReadingType(parts[2] || 'custom');
      const value = Number(payload.toString());

      await prisma.edgeSensorReading.create({
        data: { edgeId: EDGE_ID, deviceKey, type, value },
      });

      await pushReadings([{ deviceKey, type, value }]);
    } catch (e) {
      console.error('[MQTT] handle error:', e);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('[MQTT] error:', err?.message || err);
  });
} catch (e: any) {
  console.error('[MQTT] init failed:', e?.message || e);
}

// ---- Heartbeat & command sync schedulers ----
const heartbeatTimer = setInterval(async () => {
  try {
    await sendHeartbeat('online');
  } catch (e: any) {
    console.warn('[SCHED] heartbeat fail:', e?.response?.status, e?.response?.data || String(e));
  }
}, 30_000);

const commandTimer = setInterval(async () => {
  try {
    const cmds = await fetchCommands();
    for (const c of cmds) {
      try {
        // TODO: энд бодит команд гүйцэтгэх логикоо бичнэ (ж: релей асаах)
        console.log('[CMD] do:', c.id, c.payload);

        await ackCommand(c.id, true);
      } catch (err: any) {
        console.error('[CMD] exec error:', err);
        await ackCommand(c.id, false, String(err));
      }
    }
  } catch (e: any) {
    console.warn('[SCHED] fetchCommands fail:', e?.response?.status, e?.response?.data || String(e));
  }
}, 10_000);

// ---- Graceful shutdown ----
const shutdown = async () => {
  try {
    clearInterval(heartbeatTimer);
    clearInterval(commandTimer);
    if (mqttClient) {
      try { mqttClient.end(true); } catch { /* ignore */ }
    }
    await prisma.$disconnect();
    server.close(() => process.exit(0));
  } catch {
    process.exit(1);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
