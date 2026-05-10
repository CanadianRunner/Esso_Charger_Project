import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import type { PumpState } from '../types/PumpState';
import { usePumpStore } from '../stores/pumpStore';

const HUB_URL = '/hubs/pump';

let connection: HubConnection | null = null;

export function startPumpHub(): HubConnection {
  if (connection) return connection;

  connection = new HubConnectionBuilder()
    .withUrl(HUB_URL)
    .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
    .configureLogging(LogLevel.Warning)
    .build();

  const { setState, setConnection } = usePumpStore.getState();

  connection.on('pumpState', (state: PumpState) => setState(state));

  connection.onreconnecting(() => setConnection('connecting'));
  connection.onreconnected(() => setConnection('connected'));
  connection.onclose(() => setConnection('disconnected'));

  setConnection('connecting');
  connection
    .start()
    .then(() => setConnection('connected'))
    .catch(() => setConnection('disconnected'));

  return connection;
}

export async function stopPumpHub() {
  if (!connection) return;
  await connection.stop();
  connection = null;
}
