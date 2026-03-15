import { apiFetch } from "./client.js";

export function runScoring(vacancyId, body = {}) {
    return apiFetch(`/vacancies/${vacancyId}/score`, {
        method: "POST",
        body: JSON.stringify(body)
    });
}