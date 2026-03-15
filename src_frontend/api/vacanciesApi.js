import { apiFetch } from "./client.js";

export function getVacancies(limit = 20, offset = 0) {
    return apiFetch(`/vacancies?limit=${limit}&offset=${offset}`);
}

export function getVacancyById(vacancyId) {
    return apiFetch(`/vacancies/${vacancyId}`);
}