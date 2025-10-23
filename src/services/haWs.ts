// Edge: WebSocket helper for HA
import WebSocket from 'ws';

type HaMsg = { id: number; type: string; [k: string]: any };

let _id = 1;
function nextId() { return _id++; }

export async function connectHA() {
  const url = process.env.HA_WS_URL || 'ws://homeassistant.local:8123/api/websocket';
  const token = process.env.HA_TOKEN!;
  const ws = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    ws.once('error', reject);
    ws.once('open', () => resolve());
  });

  // auth handshake
  await new Promise<void>((resolve, reject) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      } else if (msg.type === 'auth_ok') {
        resolve();
      } else if (msg.type === 'auth_invalid') {
        reject(new Error('HA auth_invalid'));
      }
    });
  });

  const call = <T = any>(payload: Omit<HaMsg,'id'>) =>
    new Promise<T>((resolve, reject) => {
      const id = nextId();
      const msg = { id, ...payload };
      const onMsg = (raw: any) => {
        const res = JSON.parse(String(raw));
        if (res.id === id) {
          ws.off('message', onMsg);
          if (res.success === false) return reject(new Error(JSON.stringify(res.error || res)));
          resolve(res.result ?? res);
        }
      };
      ws.on('message', onMsg);
      ws.send(JSON.stringify(msg));
    });

  return { ws, call };
}
