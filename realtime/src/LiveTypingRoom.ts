import { Client, Room } from '@colyseus/core';
import { MapSchema, Schema, type } from '@colyseus/schema';
import { applyLiveEdit, liveMetrics, type LiveEdit } from './input.js';
import { livePassage } from './passages.js';

type LiveAuth = { userId: string; handle: string };
type JoinOptions = { inputPreference?: 'tap' | 'swipe'; ageBand?: 'teen' | 'adult' };

export class LivePlayer extends Schema {
  @type('string') userId = '';
  @type('string') handle = '';
  @type('string') input = '';
  @type('number') progress = 0;
  @type('number') wpm = 0;
  @type('number') accuracy = 100;
  @type('number') errors = 0;
  @type('number') totalTypedChars = 0;
  @type('boolean') finished = false;
  @type('string') outcome = 'pending';
  allowSwipe = false;
}

export class LiveRaceState extends Schema {
  @type('string') phase = 'waiting';
  @type('string') passage = '';
  @type('number') startsAt = 0;
  @type('number') endsAt = 0;
  @type({ map: LivePlayer }) players = new MapSchema<LivePlayer>();
}

export class LiveTypingRoom extends Room<{ state: LiveRaceState }> {
  maxClients = 2;
  private startTimer?: ReturnType<typeof setTimeout>;
  private finishTimer?: ReturnType<typeof setTimeout>;

  static async onAuth(token: string, options: JoinOptions): Promise<LiveAuth> {
    if ((options.ageBand !== 'teen' && options.ageBand !== 'adult') || typeof token !== 'string' || token.length < 20) {
      throw new Error('A verified TypeRival account is required.');
    }
    const identityUrl = process.env.TYPERIVAL_IDENTITY_URL ?? 'https://typerival.com/api/realtime/identity';
    const response = await fetch(identityUrl, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('TypeRival could not verify this player.');
    const identity = await response.json() as Partial<LiveAuth>;
    if (!identity.userId || !identity.handle) throw new Error('TypeRival player profile unavailable.');
    return { userId: identity.userId, handle: identity.handle };
  }

  onCreate() {
    this.setState(new LiveRaceState());
    this.state.passage = livePassage(this.roomId);
    this.setPrivate();
    this.onMessage('edit', (client, edit: LiveEdit) => this.acceptEdit(client, edit));
  }

  onJoin(client: Client, options: JoinOptions, auth: LiveAuth) {
    if ([...this.state.players.values()].some((player) => player.userId === auth.userId)) {
      throw new Error('This player is already in the room.');
    }
    const player = new LivePlayer();
    player.userId = auth.userId;
    player.handle = auth.handle.slice(0, 24);
    player.allowSwipe = options.inputPreference === 'swipe';
    this.state.players.set(client.sessionId, player);
    if (this.state.players.size === 2 && this.state.phase === 'waiting') this.scheduleRace();
  }

  async onDrop(client: Client) {
    if (this.state.phase === 'finished') return;
    try {
      await this.allowReconnection(client, 10);
    } catch {
      // The player did not return inside the short alpha reconnect window.
    }
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    if (this.state.phase !== 'finished') this.finishRace();
  }

  onDispose() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.finishTimer) clearTimeout(this.finishTimer);
  }

  private scheduleRace() {
    this.state.phase = 'countdown';
    this.state.startsAt = Date.now() + 3_000;
    this.state.endsAt = this.state.startsAt + 45_000;
    this.startTimer = setTimeout(() => { this.state.phase = 'racing'; }, 3_000);
    this.finishTimer = setTimeout(() => this.finishRace(), 48_000);
  }

  private acceptEdit(client: Client, edit: LiveEdit) {
    if (this.state.phase !== 'racing' || !edit || typeof edit.inputType !== 'string') return;
    if (edit.data !== null && typeof edit.data !== 'string') return;
    if (edit.value !== undefined && typeof edit.value !== 'string') return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.finished) return;
    const previous = player.input;
    const next = applyLiveEdit(previous, edit, this.state.passage.length + 20, player.allowSwipe);
    if (next === previous) return;
    const inserted = Math.max(0, Array.from(next).length - Array.from(previous).length);
    player.totalTypedChars += inserted;
    player.input = next;
    const metrics = liveMetrics(this.state.passage, next, Date.now() - this.state.startsAt, player.totalTypedChars);
    player.progress = Math.min(100, Array.from(next).length / Array.from(this.state.passage).length * 100);
    player.wpm = Math.round(metrics.wpm * 10) / 10;
    player.accuracy = Math.round(metrics.accuracy * 10) / 10;
    player.errors = metrics.errors;
    if (next === this.state.passage) player.finished = true;
    if ([...this.state.players.values()].every((entry) => entry.finished)) this.finishRace();
  }

  private finishRace() {
    if (this.state.phase === 'finished') return;
    this.state.phase = 'finished';
    const players = [...this.state.players.values()];
    if (players.length === 2) {
      const score = (player: LivePlayer) => player.accuracy >= 90 ? player.wpm * (0.7 + 0.3 * Math.max(0, Math.min(1, (player.accuracy / 100 - 0.8) / 0.18))) : 0;
      const first = score(players[0]);
      const second = score(players[1]);
      players[0].outcome = first === second ? 'draw' : first > second ? 'win' : 'loss';
      players[1].outcome = first === second ? 'draw' : second > first ? 'win' : 'loss';
    }
    if (this.finishTimer) clearTimeout(this.finishTimer);
  }
}
