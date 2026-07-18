import type { PresentationRenderer } from "@ludivra/presentation-protocol";
import type { EffectSpawnEvent } from "@ludivra/runtime-web";

export interface EffectDefinition {
  id: string;
  eventId: number;
  type: "particle-burst";
  color: number;
  count: number;
  size: number;
  speed: number;
  lifetimeMs: number;
  gravity: number;
}

export function presentEffect(
  renderer: PresentationRenderer,
  definitions: ReadonlyMap<number, EffectDefinition>,
  event: EffectSpawnEvent
): void {
  const definition = definitions.get(event.id);
  if (definition === undefined) {
    console.warn("Unknown Ludivra effect event", { id: event.id });
    return;
  }
  const intensity = Math.max(0, event.intensityMilli / 1000);
  renderer.spawnParticles({
    position: event.position,
    color: definition.color,
    count: definition.count * intensity,
    size: definition.size,
    speed: definition.speed * Math.max(intensity, 0.1),
    lifetimeMs: definition.lifetimeMs,
    gravity: definition.gravity,
    seed: event.sequence
  });
}
