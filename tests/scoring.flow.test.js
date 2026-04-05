import test from "node:test";
import assert from "node:assert/strict";
import {
    createApp,
    getFirstVacancyId,
    runScoring,
    getRuns,
    getTop
} from "./_helpers.js";

test("POST /vacancies/:vacancyId/score creates scoring run", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const res = await runScoring(app, vacancyId, 20);

        assert.equal(res.statusCode, 200);

        const body = res.json();
        assert.equal(body.ok, true);
        assert.ok(body.runId);
        assert.ok(typeof body.resumesCount === "number");
        assert.ok(typeof body.criteriaCount === "number");
    } finally {
        await app.close();
    }
});

test("runs history and top candidates can be loaded after scoring", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const scoreRes = await runScoring(app, vacancyId, 20);
        assert.equal(scoreRes.statusCode, 200);
        const scoreBody = scoreRes.json();

        const runs = await getRuns(app, vacancyId);
        assert.ok(Array.isArray(runs));
        assert.ok(runs.some((r) => String(r.run_id) === String(scoreBody.runId)));

        const topRes = await getTop(app, vacancyId, 5);
        assert.equal(topRes.statusCode, 200);

        const topBody = topRes.json();
        assert.equal(String(topBody.vacancy_id), String(vacancyId));
        assert.ok(topBody.run_id);
        assert.ok(Array.isArray(topBody.items));
    } finally {
        await app.close();
    }
});