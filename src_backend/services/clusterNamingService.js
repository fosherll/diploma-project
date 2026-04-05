import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || "";

// Maps common ESCO skill keywords to professional categories
const SKILL_CATEGORIES = [
    { name: "IT & Software", keywords: ["програмування", "software", "python", "javascript", "java", "sql", "database", "web", "api", "code", "розробк"] },
    { name: "Management", keywords: ["управління", "менеджмент", "керівництво", "планування", "організація", "leadership", "manage", "team"] },
    { name: "Finance & Accounting", keywords: ["бухгалтер", "фінанс", "облік", "податк", "звітність", "excel", "баланс", "audit"] },
    { name: "Sales & Marketing", keywords: ["продаж", "маркетинг", "клієнт", "реклама", "crm", "переговори", "sales", "marketing"] },
    { name: "Languages", keywords: ["англійська", "english", "deutsch", "польська", "мова", "переклад", "language"] },
    { name: "Engineering", keywords: ["інженер", "технічн", "проектування", "креслення", "autocad", "механік", "електрик"] },
    { name: "Healthcare", keywords: ["медицин", "лікар", "медсестр", "фармацевт", "охорон", "health"] },
    { name: "Logistics", keywords: ["логістика", "склад", "транспорт", "доставка", "водій", "вантаж"] },
    { name: "HR & Training", keywords: ["персонал", "рекрутинг", "навчання", "hr", "кадри", "підбір"] },
    { name: "Design & Creative", keywords: ["дизайн", "графіка", "photoshop", "illustrator", "ui", "ux", "творч"] },
];

function nameClusterLocally(topSkills, avgScore) {
    if (!topSkills || topSkills.length === 0) {
        return avgScore > 5 ? "Strong generalists" : "General candidates";
    }

    const text = topSkills.join(" ").toLowerCase();
    const scores = SKILL_CATEGORIES.map(cat => ({
        name: cat.name,
        score: cat.keywords.filter(kw => text.includes(kw)).length
    }));

    const best = scores.sort((a, b) => b.score - a.score)[0];
    if (best.score === 0) return avgScore > 5 ? "High-score generalists" : "General candidates";

    const level = avgScore >= 7 ? "Senior" : avgScore >= 4 ? "Mid-level" : "Junior";
    return `${level} ${best.name}`;
}

export async function nameCluster(topSkills, avgScore) {
    if (API_KEY) {
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const prompt = `You are an HR expert. Given these top skills of a candidate cluster and their average score, give a SHORT professional group name (3-5 words, in Ukrainian).

Skills: ${topSkills.join(", ") || "no specific skills"}
Average score: ${avgScore}

Reply with ONLY the group name, nothing else. Example: "Досвідчені розробники Python" or "Менеджери з продажу"`;

            const response = await ai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt });
            const name = response.text.trim().replace(/["']/g, "");
            if (name && name.length < 60) return name;
        } catch {
            // fallback to local
        }
    }
    return nameClusterLocally(topSkills, avgScore);
}
