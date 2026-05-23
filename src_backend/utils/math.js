/**
 * Спільні математичні утиліти для бекенду.
 */

/** Округлення до 4 знаків після коми. */
export function round4(value) {
    return Math.round(Number(value) * 10000) / 10000;
}
