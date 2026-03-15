import { apiFetch } from "./client.js";

export function getRuns(vacancyId) {
    return apiFetch(`/vacancies/${vacancyId}/runs`);
}

export function getTopCandidates(vacancyId, limit = 10) {
    return apiFetch(`/vacancies/${vacancyId}/top?limit=${limit}`);
}

export function getRunResults(vacancyId, runId, limit = 10) {
    return apiFetch(`/vacancies/${vacancyId}/results?run_id=${runId}&limit=${limit}`);
}

export function getCandidateDetails(vacancyId, resumeId, runId) {
    return apiFetch(`/vacancies/${vacancyId}/results/${resumeId}?run_id=${runId}`);
}

export function getCandidateSummary(vacancyId, resumeId, runId) {
    return apiFetch(`/vacancies/${vacancyId}/summary/${resumeId}?run_id=${runId}`);
}

export function getSkillsPreview(vacancyId, resumeId, runId) {
    const query = runId ? `?run_id=${encodeURIComponent(runId)}` : "";
    return apiFetch(`/vacancies/${vacancyId}/skills-preview/${resumeId}${query}`);
}

export function compareCandidates(vacancyId, resumeId1, resumeId2, runId) {
    return apiFetch(`/vacancies/${vacancyId}/compare/${resumeId1}/${resumeId2}?run_id=${runId}`);
}