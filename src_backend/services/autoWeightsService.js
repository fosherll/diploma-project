import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || "";

/**
 * Rule-based weight suggestion without any API calls.
 * Analyzes vacancy title + description for keywords and adjusts weights accordingly.
 */
function suggestWeightsLocally(vacancyTitle, vacancyDescription, calcTypes) {
    const text = `${vacancyTitle} ${vacancyDescription}`.toLowerCase();

    // Base weights
    const weights = {
        city_match: 2.5,
        region_match: 1.5,
        salary_match: 2.0,
        experience_match: 2.0,
        employment_type_match: 1.5,
        language_match: 1.5,
        title_similarity_match: 1.8,
        keyword_match: 1.8,
        education_match: 1.0,
        recency_match: 0.8,
        completeness_match: 0.7,
        bool_match: 0.3,
        skill_mapping_match: 2.0,
        semantic_skill_match: 3.0,
    };

    // Skills emphasis
    const skillKeywords = ["навичк", "вміння", "знання", "досвід роботи з", "skill", "технолог", "інструмент", "програм"];
    if (skillKeywords.some(k => text.includes(k))) {
        weights.skill_mapping_match = Math.min(5.0, weights.skill_mapping_match + 1.0);
        weights.semantic_skill_match = Math.min(5.0, weights.semantic_skill_match + 0.5);
        weights.keyword_match = Math.min(5.0, weights.keyword_match + 0.5);
    }

    // Experience emphasis
    const expKeywords = ["років досвіду", "досвід від", "досвід роботи", "стаж", "years of experience", "junior", "senior", "middle"];
    if (expKeywords.some(k => text.includes(k))) {
        weights.experience_match = Math.min(5.0, weights.experience_match + 1.2);
    }

    // Location/remote
    const remoteKeywords = ["remote", "віддалено", "дистанційно", "home office", "з дому"];
    if (remoteKeywords.some(k => text.includes(k))) {
        weights.city_match = Math.max(0.5, weights.city_match - 1.5);
        weights.region_match = Math.max(0.3, weights.region_match - 0.5);
    }

    // Strict location
    const locationKeywords = ["офіс", "в офісі", "office", "київ", "харків", "львів", "обов'язково"];
    if (locationKeywords.some(k => text.includes(k))) {
        weights.city_match = Math.min(5.0, weights.city_match + 0.8);
    }

    // Language requirements
    const langKeywords = ["англійська", "english", "мова", "language", "german", "польська", "french"];
    if (langKeywords.some(k => text.includes(k))) {
        weights.language_match = Math.min(5.0, weights.language_match + 1.5);
    }

    // Education emphasis
    const eduKeywords = ["вища освіта", "диплом", "університет", "degree", "бакалавр", "магістр"];
    if (eduKeywords.some(k => text.includes(k))) {
        weights.education_match = Math.min(5.0, weights.education_match + 1.0);
    }

    // Driver license
    const driverKeywords = ["водійське", "driver license", "категорія b", "автомобіль"];
    if (driverKeywords.some(k => text.includes(k))) {
        weights.bool_match = Math.min(5.0, weights.bool_match + 1.5);
    }

    // Salary sensitivity
    const salaryKeywords = ["конкурентна зарплата", "ставка", "оклад", "salary", "зп", "грн"];
    if (salaryKeywords.some(k => text.includes(k))) {
        weights.salary_match = Math.min(5.0, weights.salary_match + 0.5);
    }

    // Return only the calcTypes that exist in this vacancy's criteria
    const result = {};
    for (const ct of calcTypes) {
        result[ct] = weights[ct] !== undefined
            ? Math.round(weights[ct] * 10) / 10
            : 1.0;
    }
    return result;
}

/**
 * Analyzes vacancy text and suggests criteria weights.
 * Tries Gemini first, falls back to local rule-based analysis.
 */
export async function suggestWeights(vacancyTitle, vacancyDescription, calcTypes) {
    if (API_KEY) {
        try {
            return await suggestWeightsWithGemini(vacancyTitle, vacancyDescription, calcTypes);
        } catch (err) {
            console.warn("[autoWeights] Gemini failed, using local fallback:", err.message);
        }
    }

    return suggestWeightsLocally(vacancyTitle, vacancyDescription, calcTypes);
}

async function suggestWeightsWithGemini(vacancyTitle, vacancyDescription, calcTypes) {
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const criteriaDescriptions = {
        city_match: "candidate lives in the required city",
        region_match: "candidate is from the same region",
        salary_match: "candidate salary expectations fit the budget",
        experience_match: "candidate has required years of experience",
        employment_type_match: "candidate prefers the required employment type",
        language_match: "candidate knows required languages",
        title_similarity_match: "candidate's desired job title matches the vacancy",
        keyword_match: "candidate's resume contains important keywords from the vacancy",
        education_match: "candidate has required education level",
        recency_match: "candidate's resume was recently updated",
        completeness_match: "candidate's resume is detailed and complete",
        bool_match: "candidate has a required attribute (e.g. driver license)",
        skill_mapping_match: "candidate has exact ESCO skills required by the vacancy",
        semantic_skill_match: "candidate has semantically similar skills to those required",
    };

    const criteriaList = calcTypes
        .map(ct => `- ${ct}: ${criteriaDescriptions[ct] || ct}`)
        .join("\n");

    const prompt = `You are an HR system expert. Analyze the job vacancy and suggest importance weights for each scoring criterion.

Vacancy title: "${vacancyTitle}"
Vacancy description:
"""
${(vacancyDescription || "").slice(0, 2000)}
"""

Available scoring criteria:
${criteriaList}

Rules:
- Weights must be numbers between 0.1 and 5.0
- Higher weight = more important for this specific vacancy

Respond ONLY with a valid JSON object, no markdown, no explanation. Format:
{"city_match": 2.5, "salary_match": 2.0, ...}

Include ALL criteria from the list above.`;

    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
    });

    const text = response.text.trim().replace(/```json\n?|```/g, "").trim();
    const weights = JSON.parse(text);

    const result = {};
    for (const ct of calcTypes) {
        const raw = weights[ct];
        const val = typeof raw === "number" ? raw : parseFloat(raw);
        result[ct] = isNaN(val) ? 1.0 : Math.min(5.0, Math.max(0.1, Math.round(val * 10) / 10));
    }
    return result;
}
