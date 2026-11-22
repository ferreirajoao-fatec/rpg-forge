import type { CurrencyDef } from "./engine";

const round = (n: number) => Math.round(n * 100) / 100;

/** Dinheiro total na moeda padrão (a de valor 1, usada nos preços do catálogo). */
export function moneyTotal(currency: Record<string, number>, defs: CurrencyDef[]): number {
  return round(defs.reduce((t, d) => t + (currency[d.key] ?? 0) * d.value, 0));
}

/**
 * Paga `amount` (moeda padrão) com as moedas da ficha. Mantém as moedas maiores sempre que
 * possível e devolve o troco na moeda padrão (e nas menores, para frações).
 * Retorna null se faltar dinheiro.
 */
export function payWith(currency: Record<string, number>, defs: CurrencyDef[], amount: number): Record<string, number> | null {
  if (!defs.length) return null;
  const unit = Math.min(...defs.map((d) => d.value));
  const toUnits = (v: number) => Math.round(v / unit);
  const total = toUnits(moneyTotal(currency, defs));
  const price = toUnits(amount);
  if (price > total) return null;
  let left = total - price;
  const out: Record<string, number> = { ...currency };
  const sorted = [...defs].sort((a, b) => b.value - a.value);
  const std = defs.find((d) => d.value === 1) ?? sorted[sorted.length - 1];
  // Moedas maiores que a padrão ficam como estão até onde o saldo permitir.
  for (const d of sorted) {
    if (d.value <= std.value) continue;
    const per = toUnits(d.value);
    const keep = Math.min(currency[d.key] ?? 0, Math.floor(left / per));
    out[d.key] = keep;
    left -= keep * per;
  }
  // O restante vai para a moeda padrão e, nas frações, para as menores.
  for (const d of sorted) {
    if (d.value > std.value) continue;
    const per = toUnits(d.value);
    out[d.key] = Math.floor(left / per);
    left -= out[d.key] * per;
  }
  return out;
}

/** Soma `amount` (moeda padrão) ao dinheiro, separando frações na moeda menor. */
export function receive(currency: Record<string, number>, defs: CurrencyDef[], amount: number): Record<string, number> {
  const std = defs.find((d) => d.value === 1);
  if (!std) return currency;
  const whole = Math.floor(amount + 1e-9);
  const out = { ...currency, [std.key]: (currency[std.key] ?? 0) + whole };
  const frac = round(amount - whole);
  const small = [...defs].filter((d) => d.value < 1).sort((a, b) => b.value - a.value)[0];
  if (frac > 0 && small) out[small.key] = (out[small.key] ?? 0) + Math.round(frac / small.value);
  return out;
}
