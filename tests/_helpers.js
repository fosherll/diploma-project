import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://diploma:diploma@localhost:5432/diploma_db";

const { buildApp } = await import("../src_backend/server.js");

export function createApp() {
    return buildApp();
}

export async function getFirstVacancyId(app) {
    const res = await app.inject({
        method: "GET",
        url: "/vacancies?limit=1&offset=0"
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();

    if (!Array.isArray(body) || body.length === 0) {
        return null;
    }

    return String(body[0].id);
}

export async function getCriteria(app, vacancyId) {
    const res = await app.inject({
        method: "GET",
        url: `/vacancies/${vacancyId}/criteria`
    });

    assert.equal(res.statusCode, 200);
    return res.json();
}

export async function saveCriteria(app, vacancyId, items) {
    const res = await app.inject({
        method: "PUT",
        url: `/vacancies/${vacancyId}/criteria`,
        payload: { items }
    });

    return res;
}

export async function runScoring(app, vacancyId, analyzeCount = 20) {
    const res = await app.inject({
        method: "POST",
        url: `/vacancies/${vacancyId}/score`,
        payload: { analyzeCount }
    });

    return res;
}

export async function getRuns(app, vacancyId) {
    const res = await app.inject({
        method: "GET",
        url: `/vacancies/${vacancyId}/runs`
    });

    assert.equal(res.statusCode, 200);
    return res.json();
}

export async function getLatestRunId(app, vacancyId) {
    const runs = await getRuns(app, vacancyId);
    if (!Array.isArray(runs) || runs.length === 0) {
        return null;
    }
    return String(runs[0].run_id);
}

export async function getResults(app, vacancyId, runId, limit = 50) {
    const res = await app.inject({
        method: "GET",
        url: `/vacancies/${vacancyId}/results?run_id=${encodeURIComponent(runId)}&limit=${limit}`
    });

    return res;
}

export async function getTop(app, vacancyId, limit = 10) {
    const res = await app.inject({
        method: "GET",
        url: `/vacancies/${vacancyId}/top?limit=${limit}`
    });

    return res;
}