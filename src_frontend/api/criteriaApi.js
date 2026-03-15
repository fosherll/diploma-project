import { apiFetch } from "./client.js";

export function getCriteria(vacancyId) {
    return apiFetch(`/vacancies/${vacancyId}/criteria`);
}

export function updateCriteria(vacancyId, items) {
    return apiFetch(`/vacancies/${vacancyId}/criteria`, {
        method: "PUT",
        body: JSON.stringify({ items })
    });
}