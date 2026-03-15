function normalizeText(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function unique(array) {
    return [...new Set(array.filter(Boolean))];
}

function extractCity(vacancy) {
    const location = normalizeText(vacancy.location);
    if (location) return location;

    const title = normalizeText(vacancy.title);
    const match = title.match(/\bв\s+([A-ZА-ЯІЇЄҐ][a-zа-яіїєґ'’ -]+)/u);
    if (match?.[1]) {
        return match[1].trim();
    }

    return "Kyiv";
}

function extractExperienceYears(vacancy) {
    const text = [
        vacancy.title,
        vacancy.location,
        vacancy.employment_type,
        vacancy.description_text,
        vacancy.raw_html
    ]
        .map(normalizeText)
        .join(" ");

    const patterns = [
        /від\s+(\d+)\s+рок/i,
        /(\d+)\+?\s*(?:year|years|yr)/i,
        /досвід\s+роботи\s+(?:від\s+)?(\d+)\s+рок/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return Number(match[1]);
    }

    return 1;
}

function extractSalaryRange(vacancy) {
    const text = [
        vacancy.title,
        vacancy.location,
        vacancy.employment_type,
        vacancy.description_text
    ]
        .map(normalizeText)
        .join(" ");

    const numbers = [...text.matchAll(/\b(\d{4,6})\b/g)].map((m) => Number(m[1]));
    const filtered = numbers.filter((n) => Number.isFinite(n) && n >= 5000 && n <= 300000);

    if (filtered.length >= 2) {
        const sorted = filtered.sort((a, b) => a - b);
        return {
            min: sorted[0],
            max: sorted[1]
        };
    }

    if (filtered.length === 1) {
        return {
            min: Math.max(10000, filtered[0] - 10000),
            max: filtered[0]
        };
    }

    return {
        min: 15000,
        max: 40000
    };
}

function extractKeywords(vacancy) {
    const title = normalizeText(vacancy.title).toLowerCase();
    const employment = normalizeText(vacancy.employment_type).toLowerCase();
    const description = normalizeText(vacancy.description_text).toLowerCase();
    const source = `${title} ${employment} ${description}`;

    const groups = [
        {
            ifIncludes: ["менеджер", "продаж", "sales"],
            keywords: ["sales", "client", "crm", "support"]
        },
        {
            ifIncludes: ["оператор", "call", "контакт", "дзвін"],
            keywords: ["call", "support", "client", "crm"]
        },
        {
            ifIncludes: ["контент", "smm", "маркет"],
            keywords: ["content", "marketing", "client", "support"]
        },
        {
            ifIncludes: ["інженер", "конструктор", "проєкт"],
            keywords: ["engineer", "cad", "design", "project"]
        },
        {
            ifIncludes: ["зварник", "слюсар", "монтаж", "вироб"],
            keywords: ["technical", "production", "equipment", "repair"]
        },
        {
            ifIncludes: ["барбер", "перукар", "майстер", "beauty"],
            keywords: ["client", "service", "beauty", "care"]
        }
    ];

    for (const group of groups) {
        if (group.ifIncludes.some((word) => source.includes(word))) {
            return group.keywords;
        }
    }

    const rawWords = source
        .split(/[^a-zа-яіїєґ0-9+#]+/iu)
        .map((w) => w.trim())
        .filter((w) => w.length >= 4);

    const stopWords = new Set([
        "повна",
        "неповна",
        "зайнятість",
        "досвід",
        "роботи",
        "років",
        "освіта",
        "вища",
        "середня",
        "спеціальна",
        "готові",
        "взяти",
        "студента",
        "людину",
        "інвалідністю",
        "пенсіонера"
    ]);

    const filtered = rawWords.filter((w) => !stopWords.has(w));
    const fallback = unique(filtered).slice(0, 6);

    return fallback.length ? fallback : ["client", "support", "service", "work"];
}

function getRegionAliases(city) {
    const normalized = normalizeText(city).toLowerCase();

    const map = {
        kyiv: ["kyiv", "київ", "киев", "бровари", "бориспіль", "ирпень", "ірпінь", "буча", "вишневе", "brovary", "boryspil", "irpin", "bucha", "vyshneve"],
        київ: ["kyiv", "київ", "киев", "бровари", "бориспіль", "ирпень", "ірпінь", "буча", "вишневе", "brovary", "boryspil", "irpin", "bucha", "vyshneve"],
        lviv: ["lviv", "львів", "львов", "винники", "vynnyky"],
        львів: ["lviv", "львів", "львов", "винники", "vynnyky"],
        odesa: ["odesa", "odessa", "одеса", "одесса", "чорноморськ", "chernomorsk"],
        одеса: ["odesa", "odessa", "одеса", "одесса", "чорноморськ", "chernomorsk"],
        dnipro: ["dnipro", "дніпро", "днепр"],
        дніпро: ["dnipro", "дніпро", "днепр"],
        kharkiv: ["kharkiv", "харків", "харьков"],
        харків: ["kharkiv", "харків", "харьков"]
    };

    return unique(map[normalized] || [city]);
}

function extractEmploymentPreferences(vacancy) {
    const text = [
        vacancy.title,
        vacancy.employment_type,
        vacancy.description_text,
        vacancy.raw_html
    ]
        .map(normalizeText)
        .join(" ")
        .toLowerCase();

    const values = [];

    if (text.includes("повна") || text.includes("full-time") || text.includes("full time")) {
        values.push("full");
    }
    if (text.includes("неповна") || text.includes("part-time") || text.includes("part time")) {
        values.push("part");
    }
    if (text.includes("віддален") || text.includes("remote")) {
        values.push("remote");
    }
    if (text.includes("гібрид") || text.includes("hybrid")) {
        values.push("hybrid");
    }
    if (text.includes("вечір") || text.includes("вечер")) {
        values.push("evening");
    }
    if (text.includes("вихідн") || text.includes("weekend")) {
        values.push("weekend");
    }
    if (text.includes("змін") || text.includes("смен")) {
        values.push("shift");
    }

    return unique(values);
}

function extractLanguageRequirements(vacancy) {
    const text = [
        vacancy.title,
        vacancy.description_text,
        vacancy.raw_html
    ]
        .map(normalizeText)
        .join(" ")
        .toLowerCase();

    const languages = [];

    const groups = [
        ["english", ["english", "англій", "англий"]],
        ["ukrainian", ["ukrain", "україн", "украин"]],
        ["polish", ["polish", "польсь", "польск"]],
        ["german", ["german", "німець", "немец"]],
        ["french", ["french", "француз", "француз"]],
        ["spanish", ["spanish", "іспан", "испан"]]
    ];

    for (const [label, variants] of groups) {
        if (variants.some((v) => text.includes(v))) {
            languages.push(label);
        }
    }

    return unique(languages);
}

function extractTitleKeywords(vacancy) {
    const title = normalizeText(vacancy.title).toLowerCase();

    const rawWords = title
        .split(/[^a-zа-яіїєґ0-9+#]+/iu)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3);

    const stopWords = new Set([
        "по",
        "на",
        "для",
        "та",
        "and",
        "the",
        "менеджер",
        "робота"
    ]);

    return unique(rawWords.filter((w) => !stopWords.has(w))).slice(0, 8);
}

function extractEducationRequirements(vacancy) {
    const text = [
        vacancy.title,
        vacancy.description_text,
        vacancy.raw_html
    ]
        .map(normalizeText)
        .join(" ")
        .toLowerCase();

    const levels = [];

    if (text.includes("вища") || text.includes("higher education") || text.includes("degree")) {
        levels.push("higher");
    }
    if (text.includes("середня спеціальна") || text.includes("vocational") || text.includes("college")) {
        levels.push("vocational");
    }
    if (text.includes("студент") || text.includes("student")) {
        levels.push("student");
    }
    if (text.includes("середня") || text.includes("secondary")) {
        levels.push("secondary");
    }

    return unique(levels);
}

async function hasVacancyMappingLink(client, vacancyId) {
    const normalizedVacancyId = String(vacancyId);

    const { rows: directRows } = await client.query(
        `SELECT 1
         FROM vacancy_mapping_links
         WHERE vacancy_id=$1
         LIMIT 1`,
        [normalizedVacancyId]
    );

    if (directRows.length > 0) {
        return true;
    }

    const { rows: vacancyRows } = await client.query(
        `SELECT title
         FROM vacancies
         WHERE id=$1
         LIMIT 1`,
        [normalizedVacancyId]
    );

    const vacancyTitle = vacancyRows[0]?.title ? String(vacancyRows[0].title).trim() : null;

    if (!vacancyTitle) {
        return false;
    }

    const { rows: mappingRows } = await client.query(
        `SELECT 1
         FROM vac_skill_mappings
         WHERE lower(regexp_replace(trim(metadata->>'title'), '\s+', ' ', 'g')) =
               lower(regexp_replace(trim($1), '\s+', ' ', 'g'))
            OR lower(metadata->>'title') LIKE '%' || lower($1) || '%'
            OR lower($1) LIKE '%' || lower(metadata->>'title') || '%'
         LIMIT 1`,
        [vacancyTitle]
    );

    return mappingRows.length > 0;
}
export async function ensureDefaultCriteria(client, vacancyId) {
    const { rows: vacancyRows } = await client.query(
        `SELECT *
         FROM vacancies
         WHERE id=$1
         LIMIT 1`,
        [String(vacancyId)]
    );

    if (vacancyRows.length === 0) {
        throw new Error(`vacancy ${vacancyId} not found`);
    }

    const vacancy = vacancyRows[0];

    const city = extractCity(vacancy);
    const keywords = extractKeywords(vacancy);
    const experienceYears = extractExperienceYears(vacancy);
    const salaryRange = extractSalaryRange(vacancy);
    const regionAliases = getRegionAliases(city);
    const employmentPreferences = extractEmploymentPreferences(vacancy);
    const languageRequirements = extractLanguageRequirements(vacancy);
    const titleKeywords = extractTitleKeywords(vacancy);
    const educationRequirements = extractEducationRequirements(vacancy);
    const hasSkillMapping = await hasVacancyMappingLink(client, vacancyId);

    const defaultItems = [
        {
            name: "City match",
            weight: 3.0,
            calc_type: "city_match",
            config: { city },
            is_enabled: true
        },
        {
            name: "Region match",
            weight: 1.5,
            calc_type: "region_match",
            config: { city, aliases: regionAliases },
            is_enabled: true
        },
        {
            name: "Salary match",
            weight: 2.5,
            calc_type: "salary_match",
            config: {
                min_salary: salaryRange.min,
                max_salary: salaryRange.max
            },
            is_enabled: true
        },
        {
            name: "Experience match",
            weight: 2.2,
            calc_type: "experience_match",
            config: {
                min_years: experienceYears
            },
            is_enabled: true
        },
        {
            name: "Employment type match",
            weight: 1.7,
            calc_type: "employment_type_match",
            config: {
                expected_values: employmentPreferences
            },
            is_enabled: true
        },
        {
            name: "Language match",
            weight: 1.6,
            calc_type: "language_match",
            config: {
                required_languages: languageRequirements
            },
            is_enabled: true
        },
        {
            name: "Title similarity",
            weight: 1.8,
            calc_type: "title_similarity_match",
            config: {
                title_keywords: titleKeywords
            },
            is_enabled: true
        },
        {
            name: "Keyword match",
            weight: 1.8,
            calc_type: "keyword_match",
            config: { keywords },
            is_enabled: true
        },
        {
            name: "Education match",
            weight: 1.1,
            calc_type: "education_match",
            config: {
                required_levels: educationRequirements
            },
            is_enabled: true
        },
        {
            name: "Resume freshness",
            weight: 0.8,
            calc_type: "recency_match",
            config: {
                fresh_days: 90,
                acceptable_days: 180,
                stale_days: 365
            },
            is_enabled: true
        },
        {
            name: "Resume completeness",
            weight: 0.8,
            calc_type: "completeness_match",
            config: {
                min_markdown_length: 400
            },
            is_enabled: true
        },
        {
            name: "Has driver license",
            weight: 0.2,
            calc_type: "bool_match",
            config: {
                field: "driver_license",
                truthy: ["B", "C", "true", "yes"]
            },
            is_enabled: true
        }
    ];

    if (hasSkillMapping) {
        defaultItems.push({
            name: "Skill mapping match",
            weight: 2.0,
            calc_type: "skill_mapping_match",
            config: {
                min_confidence: 0.7
            },
            is_enabled: true
        });
    }

    const { rows: existingRows } = await client.query(
        `SELECT name
         FROM criteria
         WHERE vacancy_id=$1`,
        [String(vacancyId)]
    );

    const existingNames = new Set(existingRows.map((r) => String(r.name)));
    let created = false;

    for (const item of defaultItems) {
        if (existingNames.has(item.name)) continue;

        await client.query(
            `INSERT INTO criteria
             (vacancy_id, name, weight, calc_type, config, is_enabled)
             VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
            [
                String(vacancyId),
                item.name,
                item.weight,
                item.calc_type,
                JSON.stringify(item.config),
                item.is_enabled
            ]
        );

        created = true;
    }

    const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM criteria
         WHERE vacancy_id=$1`,
        [String(vacancyId)]
    );

    return {
        created,
        count: countRows[0]?.count ?? 0
    };
}