import type { AudioPlayEvent, AudioStopEvent } from "@ludivra/runtime-web";

export interface AudioDefinition {
  id: string;
  eventId: number;
  bus: "music" | "ambience" | "effects";
  loop: boolean;
  autoplay: boolean;
  volume: number;
  origin: string;
  license: string;
  source?: string;
  synth?: { waveform: OscillatorType; frequency: number; durationMs: number };
}

export interface AudioFeedback {
  unlock(): void;
  handle(event: AudioPlayEvent | AudioStopEvent): void;
  suspend(): void;
  resume(): void;
  destroy(): void;
}

export function createAudioFeedback(
  definitions: readonly AudioDefinition[],
  sourceUrls: Readonly<Record<number, string>>
): AudioFeedback {
  const context = new AudioContext();
  const master = context.createGain();
  master.connect(context.destination);
  const buses = new Map<AudioDefinition["bus"], GainNode>();
  for (const id of ["music", "ambience", "effects"] as const) {
    const gain = context.createGain();
    gain.connect(master);
    buses.set(id, gain);
  }
  const byId = new Map(definitions.map((definition) => [definition.eventId, definition]));
  const buffers = new Map<number, AudioBuffer>();
  const active = new Map<number, AudioScheduledSourceNode>();
  let unlocked = false;
  let lastSequence = 0n;
  let loadingComplete = false;

  const loading = Promise.all(Object.entries(sourceUrls).map(async ([id, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`audio asset failed to load: ${url}`);
    buffers.set(Number(id), await context.decodeAudioData(await response.arrayBuffer()));
  })).catch((error) => console.error("Ludivra audio preload failed", error)).finally(() => {
    loadingComplete = true;
  });

  function stop(id: number): void {
    const source = active.get(id);
    if (source === undefined) return;
    active.delete(id);
    try { source.stop(); } catch { /* Source already ended. */ }
  }

  function play(definition: AudioDefinition, volumeMilli: number): void {
    if (!unlocked) return;
    const bus = buses.get(definition.bus);
    if (bus === undefined) return;
    if (definition.loop) stop(definition.eventId);
    const gain = context.createGain();
    gain.gain.value = definition.volume * Math.max(0, Math.min(volumeMilli / 1000, 1));
    gain.connect(bus);
    let source: AudioScheduledSourceNode;
    const buffer = buffers.get(definition.eventId);
    if (buffer !== undefined) {
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.loop = definition.loop;
      source = node;
    } else if (definition.synth !== undefined) {
      const node = context.createOscillator();
      node.type = definition.synth.waveform;
      node.frequency.value = definition.synth.frequency;
      source = node;
    } else {
      if (!loadingComplete) void loading.then(() => play(definition, volumeMilli));
      else console.warn("Ludivra audio asset is unavailable", { id: definition.id });
      return;
    }
    source.connect(gain);
    source.addEventListener("ended", () => {
      if (active.get(definition.eventId) === source) active.delete(definition.eventId);
      gain.disconnect();
    }, { once: true });
    source.start();
    if (!definition.loop && definition.synth !== undefined) {
      source.stop(context.currentTime + definition.synth.durationMs / 1000);
    } else if (definition.loop) {
      active.set(definition.eventId, source);
    }
  }

  return {
    unlock() {
      if (unlocked) return;
      unlocked = true;
      void context.resume();
      void loading.then(() => {
        for (const definition of definitions) {
          if (definition.autoplay) play(definition, 1000);
        }
      });
    },
    handle(event) {
      if (event.sequence <= lastSequence) return;
      lastSequence = event.sequence;
      const definition = byId.get(event.id);
      if (definition === undefined) {
        console.warn("Unknown Ludivra audio event", { id: event.id });
        return;
      }
      if (event.type === "audio-stop") stop(event.id);
      else play(definition, event.volumeMilli);
    },
    suspend() { void context.suspend(); },
    resume() { if (unlocked) void context.resume(); },
    destroy() {
      for (const id of active.keys()) stop(id);
      void context.close();
    }
  };
}
