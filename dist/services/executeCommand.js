"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeCommand = executeCommand;
async function executeCommand(cmd) {
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
        // өөр төрлүүдийг энд үргэлжлүүлээрэй...
        default:
            console.warn('[EXEC] unknown type:', cmd.type);
            return;
    }
}
