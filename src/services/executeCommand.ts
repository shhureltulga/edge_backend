// Минимал жишээ — MQTT байхгүй бол логлоно, байгаа тохиолдолд publish хийнэ.
export interface EdgeCommandInput {
  id: string;         // main id (ACK-д)
  type: string;       // light.set ...
  deviceKey: string;  // main_light ...
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

    // өөр төрлүүдийг энд үргэлжлүүлээрэй...

    default:
      console.warn('[EXEC] unknown type:', cmd.type);
      return;
  }
}
