import { apiFetch } from "./client.js";

export function getVacancies(limit = 20, offset = 0, search = "") {
    const params = new URLSearchParams({ limit, offset });
    if (search) params.set("search", search);
    return apiFetch(`/vacancies?${params}`);
}

export function getVacancyById(vacancyId) {
    return apiFetch(`/vacancies/${vacancyId}`);
}
