/** Presentation ordering keeps IDs, media and locked anchors intact. */
export function reorderShots<T extends { id: string; locked?: boolean }>(items: T[], fromId: string, toId: string): { items: T[]; moved: boolean; reason?: string } {
  const from = items.findIndex(t => t.id === fromId), to = items.findIndex(t => t.id === toId);
  if (from < 0 || to < 0 || from === to) return { items, moved: false };
  if (items.slice(Math.min(from, to), Math.max(from, to) + 1).some(t => t.locked)) return { items, moved: false, reason: "Desbloquea las tomas antes de moverlas o atravesarlas." };
  const next = [...items]; next.splice(to, 0, next.splice(from, 1)[0]);
  return { items: next, moved: true };
}
