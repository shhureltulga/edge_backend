"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectHA = connectHA;
// Edge: WebSocket helper for HA
const ws_1 = __importDefault(require("ws"));
let _id = 1;
function nextId() { return _id++; }
async function connectHA() {
    const url = process.env.HA_WS_URL || 'ws://homeassistant.local:8123/api/websocket';
    const token = process.env.HA_TOKEN;
    const ws = new ws_1.default(url);
    await new Promise((resolve, reject) => {
        ws.once('error', reject);
        ws.once('open', () => resolve());
    });
    // auth handshake
    await new Promise((resolve, reject) => {
        ws.on('message', (raw) => {
            const msg = JSON.parse(String(raw));
            if (msg.type === 'auth_required') {
                ws.send(JSON.stringify({ type: 'auth', access_token: token }));
            }
            else if (msg.type === 'auth_ok') {
                resolve();
            }
            else if (msg.type === 'auth_invalid') {
                reject(new Error('HA auth_invalid'));
            }
        });
    });
    const call = (payload) => new Promise((resolve, reject) => {
        const id = nextId();
        const msg = { id, ...payload };
        const onMsg = (raw) => {
            const res = JSON.parse(String(raw));
            if (res.id === id) {
                ws.off('message', onMsg);
                if (res.success === false)
                    return reject(new Error(JSON.stringify(res.error || res)));
                resolve(res.result ?? res);
            }
        };
        ws.on('message', onMsg);
        ws.send(JSON.stringify(msg));
    });
    return { ws, call };
}
