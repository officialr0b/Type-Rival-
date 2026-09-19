import { Client, Room } from '@colyseus/core';
import { MapSchema, Schema, type } from '@colyseus/schema';
import { applyLiveEdit, decideLiveWinner, insertedCharacters, liveMetrics, type LiveEdit } from './input.js';
import { livePassage } from './passages.js';

type LiveAuth = { userId: string; handle: string };
type JoinOptions = { inputPreference?: 'tap' | 'swipe' | 'steno'; ageBand?: 'teen' | 'adult'; language?: unknown };

export class LivePlayer extends Schema {
  @type('string') handle = '';
  @type('string') input = '';
  @type('number') progress = 0;
  @type('number') wpm = 0;
  @type('number') accuracy = 100;
  @type('number') errors = 0;
  @type('number') totalTypedChars = 0;
  @type('boolean') finished = false;
  @type('boolean') connected = true;
  @type('string') outcome = 'pending';
  allowSwipe = false;
}

export class LiveRaceState extends Schema {
  @type('string') phase = 'waiting';
  @type('string') language = 'en';
  @type('string') passageId = '';
  @type('string') passage = '';
  @type('number') startsAt = 0;
  @type('number') endsAt = 0;
  @type('number') serverNow = 0;
  @type('number') finishedAt = 0;
  @type('string') finishReason = '';
  @type({ map: LivePlayer }) players = new MapSchema<LivePlayer>();
}

export class LiveTypingRoom extends Room<{ state: LiveRaceState }> {
  maxClients = 2;
  maxMessagesPerSecond = 80;
  private userIds = new Map<string, string>();
  private startTimer?: ReturnType<typeof this.clock.setTimeout>;
  private finishTimer?: ReturnType<typeof this.clock.setTimeout>;

  static async onAuth(token: string, options: JoinOptions): Promise<LiveAuth> {
    if ((options.ageBand !== 'teen' && options.ageBand !== 'adult') || typeof token !== 'string' || token.length < 20 || token.length > 4_096) {
      throw new Error('A verified TypeRival account is required.');
    }
    const identityUrl = process.env.TYPERIVAL_IDENTITY_URL ?? 'https://typerival.com/api/realtime/identity';
    const response = await fetch(identityUrl, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!response.ok) throw new Error('TypeRival could not verify this player.');
    const identity = await response.json() as Partial<LiveAuth>;
    if (!identity.userId || !identity.handle) throw new Error('TypeRival player profile unavailable.');
    return { userId: identity.userId, handle: identity.handle.replace(/[^A-Za-z0-9_]/g, '').slice(0, 18) || 'Rival' };
  }

  onCreate(options: JoinOptions) {
    this.setState(new LiveRaceState());
    const passage = livePassage(this.roomId, options.language);
    this.state.language = passage.language;
    this.state.passageId = passage.id;
    this.state.passage = passage.text;
    this.state.serverNow = Date.now();
    this.clock.setInterval(() => { this.state.serverNow = Date.now(); }, 1_000);
    this.setPrivate();
    this.onMessage('edit', (client, edit: LiveEdit) => this.acceptEdit(client, edit));
  }

  onJoin(client: Client, options: JoinOptions, auth: LiveAuth) {
    if ([...this.userIds.values()].includes(auth.userId)) {
      throw new Error('This player is already in the room.');
    }
    const player = new LivePlayer();
    player.handle = auth.handle;
    // Both swipe keyboards and steno translation software can emit bounded
    // multi-character edits. Paste/drop remain rejected by applyLiveEdit.
    player.allowSwipe = options.inputPreference === 'swipe' || options.inputPreference === 'steno';
    this.userIds.set(client.sessionId, auth.userId);
    this.state.players.set(client.sessionId, player);
    if (this.state.players.size === 2 && this.state.phase === 'waiting') this.scheduleRace();
  }

  async onDrop(client: Client) {
    if (this.state.phase === 'finished') return;
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    try {
      await this.allowReconnection(client, 15);
    } catch {
      // onLeave handles the final waiting-room removal or in-race forfeit.
    }
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    this.userIds.delete(client.sessionId);
    if (!player || this.state.phase === 'finished') return;
    player.connected = false;
    if (this.state.phase === 'waiting' || this.state.phase === 'countdown') {
      this.cancelCountdown();
      this.state.players.delete(client.sessionId);
      this.resetWaitingPlayers();
      return;
    }
    player.finished = true;
    player.outcome = 'loss';
    for (const [sessionId, rival] of this.state.players) {
      if (sessionId !== client.sessionId) {
        rival.finished = true;
        rival.outcome = 'win';
      }
    }
    this.finishRace('forfeit');
  }

  onDispose() {
    this.cancelCountdown();
    this.userIds.clear();
  }

  private scheduleRace() {
    this.state.phase = 'countdown';
    this.state.serverNow = Date.now();
    this.state.startsAt = this.state.serverNow + 3_000;
    this.state.endsAt = this.state.startsAt + 45_000;
    this.startTimer = this.clock.setTimeout(() => {
      this.state.phase = 'racing';
      this.state.serverNow = Date.now();
    }, 3_000);
    this.finishTimer = this.clock.setTimeout(() => this.finishRace('time'), 48_000);
  }

  private acceptEdit(client: Client, edit: LiveEdit) {
    if (this.state.phase !== 'racing' || !edit || typeof edit.inputType !== 'string') return;
    if (edit.inputType.length > 64) return;
    if (edit.data !== null && typeof edit.data !== 'string') return;
    if (edit.value !== undefined && typeof edit.value !== 'string') return;
    if ((edit.data?.length ?? 0) > 128 || (edit.value?.length ?? 0) > this.state.passage.length + 64) return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.finished || !player.connected) return;
    const previous = player.input;
    const next = applyLiveEdit(previous, edit, this.state.passage.length + 20, player.allowSwipe);
    if (next === previous) return;
    player.totalTypedChars += insertedCharacters(previous, next);
    player.input = next;
    const metrics = liveMetrics(this.state.passage, next, Date.now() - this.state.startsAt, player.totalTypedChars);
    player.progress = Math.min(100, Array.from(next).length / Array.from(this.state.passage).length * 100);
    player.wpm = Math.round(metrics.wpm * 10) / 10;
    player.accuracy = Math.round(metrics.accuracy * 10) / 10;
    player.errors = metrics.errors;
    if (next === this.state.passage) player.finished = true;
    if ([...this.state.players.values()].every((entry) => entry.finished)) this.finishRace('completed');
  }

  private finishRace(reason: 'time' | 'completed' | 'forfeit') {
    if (this.state.phase === 'finished') return;
    this.state.phase = 'finished';
    this.state.serverNow = Date.now();
    this.state.finishedAt = this.state.serverNow;
    this.state.finishReason = reason;
    const players = [...this.state.players.values()];
    if (players.length === 2 && reason !== 'forfeit') {
      const firstMetrics = liveMetrics(this.state.passage, players[0].input, Math.max(1_000, this.state.finishedAt - this.state.startsAt), players[0].totalTypedChars);
      const secondMetrics = liveMetrics(this.state.passage, players[1].input, Math.max(1_000, this.state.finishedAt - this.state.startsAt), players[1].totalTypedChars);
      const winner = decideLiveWinner(firstMetrics, secondMetrics);
      players[0].outcome = winner === 'draw' ? 'draw' : winner === 'a' ? 'win' : 'loss';
      players[1].outcome = winner === 'draw' ? 'draw' : winner === 'b' ? 'win' : 'loss';
      players[0].finished = true;
      players[1].finished = true;
    }
    if (this.finishTimer) this.finishTimer.clear();
  }

  private cancelCountdown() {
    if (this.startTimer) this.startTimer.clear();
    if (this.finishTimer) this.finishTimer.clear();
    this.startTimer = undefined;
    this.finishTimer = undefined;
  }

  private resetWaitingPlayers() {
    this.state.phase = 'waiting';
    this.state.startsAt = 0;
    this.state.endsAt = 0;
    for (const player of this.state.players.values()) {
      player.input = '';
      player.progress = 0;
      player.wpm = 0;
      player.accuracy = 100;
      player.errors = 0;
      player.totalTypedChars = 0;
      player.finished = false;
      player.connected = true;
      player.outcome = 'pending';
    }
  }
}
