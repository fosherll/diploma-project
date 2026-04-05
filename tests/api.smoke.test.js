import test from "node:test";
import assert from "node:assert/strict";
import { createApp, getFirstVacancyId, getCriteria, saveCriteria } from "./_helpers.js";

test("GET /health returns ok", async () => {
    const app = createApp();

    try {
        const res = await app.inject({
            method: "GET",
            url: "/health"
        });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { ok: true });
    } finally {
        await app.close();
    }
});

test("unknown route returns 404 with structured error", async () => {
    const app = createApp();

    try {
        const res = await app.inject({
            method: "GET",
            url: "/no-such-route"
        });

        assert.equal(res.statusCode, 404);

        const body = res.json();
        assert.equal(body.ok, false);
        assert.equal(body.error.code, "NOT_FOUND");
    } finally {
        await app.close();
    }
});

test("GET /vacancies returns array", async () => {
    const app = createApp();

    try {
        const res = await app.inject({
            method: "GET",
            url: "/vacancies?limit=5&offset=0"
        });

        assert.equal(res.statusCode, 200);
        assert.ok(Array.isArray(res.json()));
    } finally {
        await app.close();
    }
});

test("GET /vacancies/:vacancyId returns vacancy if one exists", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);

        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const res = await app.inject({
            method: "GET",
            url: `/vacancies/${vacancyId}`
        });

        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(String(body.id), vacancyId);
    } finally {
        await app.close();
    }
});

test("GET /vacancies/:vacancyId/criteria returns array", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);

        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const criteria = await getCriteria(app, vacancyId);
        assert.ok(Array.isArray(criteria));
    } finally {
        await app.close();
    }
});

test("PUT /vacancies/:vacancyId/criteria saves criteria set", async (t) => {
    const app = createApp();

    try {
        const vacancyId = await getFirstVacancyId(app);

        if (!vacancyId) {
            t.skip("No vacancies in database");
            return;
        }

        const payloadItems = [
            {
                name: "Test Criterion",
                weight: 1,
                calc_type: "keyword_match",
                config: { keywords: ["test"], required: false },
                is_enabled: true
            }
        ];

        const putRes = await saveCriteria(app, vacancyId, payloadItems);
        assert.equal(putRes.statusCode, 200);

        const body = putRes.json();
        assert.equal(body.ok, true);
        assert.equal(body.count, 1);

        const criteria = await getCriteria(app, vacancyId);
        assert.ok(Array.isArray(criteria));
        assert.equal(criteria.length, 1);
        assert.equal(criteria[0].name, "Test Criterion");
    } finally {
        await app.close();
    }
});