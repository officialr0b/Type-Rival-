import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { LiveTypingRoom } from '../src/LiveTypingRoom.js';

type JsonResponse = { json: (body: unknown) => unknown };
type RealtimeHttpApp = {
  disable: (name: string) => void;
  get: (path: string, handler: (request: unknown, response: JsonResponse) => unknown) => void;
};

const httpServer = createServer();
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer } as unknown as ConstructorParameters<typeof WebSocketTransport>[0]),
  express: (colyseusApp) => {
    const app = colyseusApp as unknown as RealtimeHttpApp;
    app.disable('x-powered-by');
    app.get('/', (_request, response) => response.json({ service: 'typerival-realtime', status: 'ready' }));
    app.get('/health', (_request, response) => response.json({ ok: true, transport: 'colyseus-websocket' }));
  },
});
gameServer.define('live_friendly', LiveTypingRoom);

const serverlessHandler = process.env.VERCEL ? await gameServer.serverless() : undefined;
export default serverlessHandler;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 2567);
  await gameServer.listen(port);
  console.log(`TypeRival realtime listening on http://localhost:${port}`);
}
