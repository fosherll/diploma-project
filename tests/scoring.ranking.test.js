import test from "node:test";
import assert from "node:assert/strict";
import {
    createApp,
    getFirstVacancyId,
    runScoring,
    getResults,
    getTop
} from "./_helpers.js";

test("results are returned for created run", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const scoreRes = await runScoring(app, vacancyId, 20);
        assert.equal(scoreRes.statusCode, 200);

        const runId = String(scoreRes.json().runId);

        const resultsRes = await getResults(app, vacancyId, runId, 50);
        assert.equal(resultsRes.statusCode, 200);

        const results = resultsRes.json();
        assert.ok(Array.isArray(results));
    } finally {
        await app.close();
    }
});

test("results are sorted by total_score descending", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const scoreRes = await runScoring(app, vacancyId, 50);
        const runId = String(scoreRes.json().runId);

        const resultsRes = await getResults(app, vacancyId, runId, 100);
        assert.equal(resultsRes.statusCode, 200);

        const items = resultsRes.json();

        if (!Array.isArray(items) || items.length < 2) {
            t.skip("Not enough candidates to verify sorting");
            return;
        }

        for (let i = 0; i < items.length - 1; i += 1) {
            const current = Number(items[i].total_score);
            const next = Number(items[i + 1].total_score);
            assert.ok(current >= next, `Item ${i} score must be >= item ${i + 1}`);
        }
    } finally {
        await app.close();
    }
});

test("top endpoint matches top of latest ranking", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const scoreRes = await runScoring(app, vacancyId, 50);
        const runId = String(scoreRes.json().runId);

        const resultsRes = await getResults(app, vacancyId, runId, 5);
        assert.equal(resultsRes.statusCode, 200);
        const results = resultsRes.json();

        const topRes = await getTop(app, vacancyId, 5);
        assert.equal(topRes.statusCode, 200);
        const topBody = topRes.json();

        if (!Array.isArray(results) || results.length === 0) {
            t.skip("No results to compare");
            return;
        }

        if (!Array.isArray(topBody.items) || topBody.items.length === 0) {
            t.skip("No top candidates to compare");
            return;
        }

        assert.equal(String(topBody.run_id), runId);
        assert.equal(String(topBody.items[0].resume_id), String(results[0].resume_id));
        assert.equal(Number(topBody.items[0].total_score), Number(results[0].total_score));
    } finally {
        await app.close();
    }
});