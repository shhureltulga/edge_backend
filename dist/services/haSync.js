"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHaSyncWorker = startHaSyncWorker;
// src/services/haSync.ts
const mainClient_1 = require("./mainClient");
const ha_1 = require("../utils/ha");
async function handleCommand(c) {
    let status = 'acked';
    let error = null;
    try {
        const p = c.payload || {};
        const op = p?.op;
        // Нийтлэг талбарууд
        const roomName = p?.room?.name; // ensure/delete fallback
        const haAreaId = (p?.haAreaId || p?.areaId);
        switch (op) {
            case 'ha.area.ensure': {
                if (!roomName)
                    throw new Error('missing room.name');
                await (0, ha_1.ensureAreaByName)(roomName);
                break;
            }
            case 'ha.area.rename': {
                // main-аас ирэх шинэ талбарууд
                const fromName = p?.fromName;
                const toName = p?.toName ?? roomName;
                if (!toName)
                    throw new Error('missing toName');
                // 1) area_id өгөгдвөл шууд rename
                if (haAreaId) {
                    await (0, ha_1.updateArea)(haAreaId, toName);
                    break;
                }
                // 2) fromName-аар хайж rename
                if (fromName) {
                    const a = await (0, ha_1.findAreaByName)(fromName);
                    if (a?.area_id) {
                        await (0, ha_1.updateArea)(a.area_id, toName);
                        break;
                    }
                }
                // 3) fallback: toName өөрөө байхгүй бол шинээр үүсгэе,
                //    байгаад нэр нь яг ижил байвал юу ч хийхгүй.
                const exists = await (0, ha_1.findAreaByName)(toName);
                if (!exists) {
                    await (0, ha_1.ensureAreaByName)(toName);
                }
                break;
            }
            case 'ha.area.delete': {
                // 1) area_id байвал шууд устга
                if (haAreaId) {
                    await (0, ha_1.deleteArea)(haAreaId);
                    break;
                }
                // 2) нэрээр хайж устга
                const targetName = roomName || p?.name;
                if (targetName) {
                    const a = await (0, ha_1.findAreaByName)(targetName);
                    if (a?.area_id) {
                        await (0, ha_1.deleteArea)(a.area_id);
                    }
                }
                break;
            }
            default: {
                status = 'failed';
                error = `unknown_op: ${op}`;
            }
        }
    }
    catch (e) {
        status = 'failed';
        error = e?.message || String(e);
    }
    try {
        await (0, mainClient_1.ackCommand)(c.id, status === 'acked', error ?? undefined);
    }
    catch {
        // чимээгүй — дараагийн polling дээр дахин оролдоно
    }
}
async function pollOnce() {
    try {
        const cmds = await (0, mainClient_1.fetchCommands)();
        if (!cmds?.length)
            return;
        for (const c of cmds) {
            await handleCommand(c);
        }
    }
    catch {
        // чимээгүй алгасна
    }
}
function startHaSyncWorker(intervalMs = 2000) {
    setInterval(pollOnce, intervalMs);
}
