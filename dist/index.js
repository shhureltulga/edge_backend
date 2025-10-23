"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const mqtt_1 = __importDefault(require("mqtt"));
const edgeApi = __importStar(require("./services/mainClient"));
const mainClient_1 = require("./services/mainClient");
const haSync_1 = require("./services/haSync");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
app.use(express_1.default.json());
(0, haSync_1.startHaSyncWorker)(2000);
// ---- ENV ----
const PORT = Number(process.env.PORT || 4000);
const EDGE_ID = process.env.EDGE_ID || 'edge_local';
const MQTT_URL = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';
// ---- Helpers ----
const toReadingType = (t) => {
    const v = (t || '').trim();
    return Object.values(client_1.ReadingType).includes(v)
        ? v
        : client_1.ReadingType.custom;
};
// ---- Healthcheck ----
app.get('/health', async (_req, res) => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        res.json({ ok: true, edgeId: EDGE_ID });
    }
    catch (e) {
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
    }
    catch (e) {
        const code = e?.response?.status;
        const data = e?.response?.data;
        console.error('[EDGE] heartbeat error:', 'status=', code, 'data=', data, 'message=', e?.message);
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
        const list = (req.body?.readings ?? []);
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
        await (0, mainClient_1.pushReadings)(list);
        return res.json({ ok: true, saved: list.length, pushed: list.length });
    }
    catch (e) {
        console.error('[INGEST] error:', e?.response?.status, e?.response?.data || String(e));
        return res.status(500).json({ ok: false, error: 'ingest_failed' });
    }
});
// ---- Start server ----
const server = app.listen(PORT, () => {
    console.log(`EDGE up on :${PORT}`);
});
// ---- MQTT listener (сонголт) ----
let mqttClient = null;
try {
    mqttClient = mqtt_1.default.connect(MQTT_URL);
    mqttClient.on('connect', () => {
        console.log('[MQTT] connected:', MQTT_URL);
        // topic format: edge/<deviceKey>/<type>
        mqttClient.subscribe('edge/+/+');
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
            await (0, mainClient_1.pushReadings)([{ deviceKey, type, value }]);
        }
        catch (e) {
            console.error('[MQTT] handle error:', e);
        }
    });
    mqttClient.on('error', (err) => {
        console.error('[MQTT] error:', err?.message || err);
    });
}
catch (e) {
    console.error('[MQTT] init failed:', e?.message || e);
}
// ---- Heartbeat & command sync schedulers ----
const heartbeatTimer = setInterval(async () => {
    try {
        await (0, mainClient_1.heartbeat)('online');
    }
    catch (e) {
        console.warn('[SCHED] heartbeat fail:', e?.response?.status, e?.response?.data || String(e));
    }
}, 30000);
const commandTimer = setInterval(async () => {
    try {
        const cmds = await (0, mainClient_1.fetchCommands)();
        for (const c of cmds) {
            try {
                // TODO: энд бодит команд гүйцэтгэх логикоо бичнэ (ж: релей асаах)
                console.log('[CMD] do:', c.id, c.payload);
                await (0, mainClient_1.ackCommand)(c.id, true);
            }
            catch (err) {
                console.error('[CMD] exec error:', err);
                await (0, mainClient_1.ackCommand)(c.id, false, String(err));
            }
        }
    }
    catch (e) {
        console.warn('[SCHED] fetchCommands fail:', e?.response?.status, e?.response?.data || String(e));
    }
}, 10000);
// ---- Graceful shutdown ----
const shutdown = async () => {
    try {
        clearInterval(heartbeatTimer);
        clearInterval(commandTimer);
        if (mqttClient) {
            try {
                mqttClient.end(true);
            }
            catch { /* ignore */ }
        }
        await prisma.$disconnect();
        server.close(() => process.exit(0));
    }
    catch {
        process.exit(1);
    }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
