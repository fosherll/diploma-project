export function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString();
}

export function formatScore(value) {
    if (value === null || value === undefined) return "—";
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return num.toFixed(4);
}