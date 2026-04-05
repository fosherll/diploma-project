import test from "node:test";
import assert from "node:assert/strict";
import { createApp, getFirstVacancyId } from "./_helpers.js";

test("GET /vacancies with invalid limit returns validation error", async () => {
    const app = createApp();

    try {
        const res = await app.inject({
            method: "GET",
            url: "/vacancies?limit=0&offset=0"
        });

        assert.equal(res.statusCode, 400);
        const body = res.json();
        assert.equal(body.ok, false);
        assert.equal(body.error.code, "VALIDATION_ERROR");
    } finally {
        await app.close();
    }
});

test("GET /vacancies/non-existent-id returns 404", async () => {
    const app = createApp();

    try {
        const res = await app.inject({
            method: "GET",
            url: "/vacancies/999999999999"
        });

        assert.equal(res.statusCode, 404);
        const body = res.json();
        assert.equal(body.ok, false);
    } finally {
        await app.close();
    }
});

test("PUT /vacancies/:vacancyId/criteria with invalid body returns 400", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const res = await app.inject({
            method: "PUT",
            url: `/vacancies/${vacancyId}/criteria`,
            payload: { wrongField: [] }
        });

        assert.equal(res.statusCode, 400);
        const body = res.json();
        assert.equal(body.ok, false);
        assert.equal(body.error.code, "VALIDATION_ERROR");
    } finally {
        await app.close();
    }
});

test("POST /vacancies/:vacancyId/score with invalid analyzeCount returns 400", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const res = await app.inject({
            method: "POST",
            url: `/vacancies/${vacancyId}/score`,
            payload: { analyzeCount: 0 }
        });

        assert.equal(res.statusCode, 400);
        const body = res.json();
        assert.equal(body.ok, false);
    } finally {
        await app.close();
    }
});

test("GET /vacancies/:vacancyId/results without run_id returns 400", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);
        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const res = await app.inject({
            method: "GET",
            url: `/vacancies/${vacancyId}/results`
        });

        assert.equal(res.statusCode, 400);
        const body = res.json();
        assert.equal(body.ok, false);
        assert.equal(body.error.code, "VALIDATION_ERROR");
    } finally {
        await app.close();
    }
});