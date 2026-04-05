import test from "node:test";
import assert from "node:assert/strict";
import {
    createApp,
    getFirstVacancyId,
    getCriteria,
    saveCriteria,
    runScoring,
    getRuns,
    getResults
} from "./_helpers.js";

test("criteria update + rerun creates a new run and preserves history", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        let originalCriteria = await getCriteria(app, vacancyId);

        if (!Array.isArray(originalCriteria) || originalCriteria.length === 0) {
            const bootstrapScoreRes = await runScoring(app, vacancyId, 20);
            assert.equal(bootstrapScoreRes.statusCode, 200);
            originalCriteria = await getCriteria(app, vacancyId);
        }

        if (!Array.isArray(originalCriteria) || originalCriteria.length === 0) {
            t.skip("Could not obtain criteria for vacancy");
            return;
        }

        const beforeRuns = await getRuns(app, vacancyId);
        const beforeCount = beforeRuns.length;

        const firstScoreRes = await runScoring(app, vacancyId, 20);
        assert.equal(firstScoreRes.statusCode, 200);
        const firstRunId = String(firstScoreRes.json().runId);

        const modifiedCriteria = originalCriteria.map((item, index) => ({
            name: item.name,
            weight: index === 0 ? Number(item.weight || 1) + 5 : Number(item.weight || 1),
            calc_type: item.calc_type,
            config: item.config ?? {},
            is_enabled: item.is_enabled ?? true
        }));

        const saveRes = await saveCriteria(app, vacancyId, modifiedCriteria);
        assert.equal(saveRes.statusCode, 200);

        const secondScoreRes = await runScoring(app, vacancyId, 20);
        assert.equal(secondScoreRes.statusCode, 200);
        const secondRunId = String(secondScoreRes.json().runId);

        assert.notEqual(secondRunId, firstRunId);

        const afterRuns = await getRuns(app, vacancyId);
        assert.ok(afterRuns.length >= beforeCount + 2 || afterRuns.length >= 2);

        assert.ok(afterRuns.some((r) => String(r.run_id) === firstRunId));
        assert.ok(afterRuns.some((r) => String(r.run_id) === secondRunId));

        const firstResultsRes = await getResults(app, vacancyId, firstRunId, 20);
        const secondResultsRes = await getResults(app, vacancyId, secondRunId, 20);

        assert.equal(firstResultsRes.statusCode, 200);
        assert.equal(secondResultsRes.statusCode, 200);

        const firstResults = firstResultsRes.json();
        const secondResults = secondResultsRes.json();

        assert.ok(Array.isArray(firstResults));
        assert.ok(Array.isArray(secondResults));
    } finally {
        await app.close();
    }
});

test("updated criteria are persisted before rerun", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        let criteria = await getCriteria(app, vacancyId);

        if (!Array.isArray(criteria) || criteria.length === 0) {
            await runScoring(app, vacancyId, 20);
            criteria = await getCriteria(app, vacancyId);
        }

        if (!Array.isArray(criteria) || criteria.length === 0) {
            t.skip("No criteria available");
            return;
        }

        const updated = criteria.map((item, index) => ({
            name: item.name,
            weight: index === 0 ? 9 : Number(item.weight || 1),
            calc_type: item.calc_type,
            config: item.config ?? {},
            is_enabled: item.is_enabled ?? true
        }));

        const putRes = await saveCriteria(app, vacancyId, updated);
        assert.equal(putRes.statusCode, 200);

        const saved = await getCriteria(app, vacancyId);
        assert.ok(Array.isArray(saved));
        assert.equal(Number(saved[0].weight), 9);
    } finally {
        await app.close();
    }
});