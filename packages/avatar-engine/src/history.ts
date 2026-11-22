/** Histórico de edição com desfazer e refazer (imutável; serve para qualquer estado). */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const LIMIT = 100;

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/** Registra um novo estado. Estados iguais ao atual (mesmo JSON) não geram entrada. */
export function record<T>(h: History<T>, next: T, limit = LIMIT): History<T> {
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
