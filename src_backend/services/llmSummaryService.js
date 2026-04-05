import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || "";

/**
 * Local template-based summary — works without Gemini.
 */
function generateLocalSummary({ vacancyTitle, candidateName, candidateCity, totalScore, strengths, weaknesses, matchedSkills, missingSkills }) {
    const name = candidateName || "Кандидат";
    const city = candidateCity ? ` (${candidateCity})` : "";
    const score = Number(totalScore).toFixed(2);

    const fitLevel = totalScore >= 7 ? "відмінно підходить" : totalScore >= 5 ? "частково підходить" : "слабо відповідає вимогам";
    const fitWord = totalScore >= 7 ? "Сильний кандидат" : totalScore >= 5 ? "Перспективний кандидат" : "Кандидат";

    let summary = `${fitWord} ${name}${city} отримав загальний бал ${score} і ${fitLevel} на вакансію «${vacancyTitle}».`;

    if (strengths.length > 0) {
        const top = strengths.slice(0, 2).map(s => s.name).join(" та ");
        summary += ` Основні сильні сторони: ${top}.`;
    }

    if (matchedSkills.length > 0) {
        summary += ` Підтверджені навички за ESCO: ${matchedSkills.slice(0, 4).join(", ")}.`;
    }

    if (weaknesses.length > 0) {
        const weak = weaknesses.slice(0, 1).map(w => w.name).join(", ");
        summary += ` Слабке місце — ${weak}.`;
    }

    if (missingSkills.length > 0) {
        summary += ` Відсутні навички: ${missingSkills.slice(0, 3).join(", ")}.`;
        summary += " Рекомендується уточнити ці компетенції на співбесіді.";
    } else {
        summary += totalScore >= 6
            ? " Рекомендується запросити на співбесіду."
            : " Рекомендується порівняти з іншими кандидатами перед запрошенням.";
    }

    return summary;
}

/**
 * Generates an AI explanation of why a candidate fits (or doesn't fit) a vacancy.
 * Falls back to local template summary if Gemini is unavailable.
 */
export async function generateCandidateSummary({
    vacancyTitle,
    candidateName,
    candidateCity,
    totalScore,
    strengths = [],
    weaknesses = [],
    matchedSkills = [],
    missingSkills = [],
}) {
    const params = { vacancyTitle, candidateName, candidateCity, totalScore, strengths, weaknesses, matchedSkills, missingSkills };

    if (API_KEY) {
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });

            const strengthsList = strengths.map(s => `- ${s.name}: ${s.explanation}`).join("\n") || "— (none)";
            const weaknessesList = weaknesses.map(w => `- ${w.name}: ${w.explanation}`).join("\n") || "— (none)";
            const matchedList = matchedSkills.length > 0 ? matchedSkills.join(", ") : "none detected";
            const missingList = missingSkills.length > 0 ? missingSkills.join(", ") : "none";

            const prompt = `You are an HR assistant analyzing candidate fit for a job vacancy.

Vacancy: "${vacancyTitle}"
Candidate: ${candidateName || "Unknown"}, city: ${candidateCity || "not specified"}
Total scoring score: ${totalScore}

Strengths (scoring criteria where candidate performed well):
${strengthsList}

Weaknesses (scoring criteria where candidate performed poorly):
${weaknessesList}

Matched ESCO skills: ${matchedList}
Missing skills: ${missingList}

Write a concise professional summary (3-5 sentences) in Ukrainian explaining:
1. Whether this candidate is a good fit for the vacancy
2. Key reasons why (based on strengths/weaknesses above)
3. One specific recommendation for the recruiter

Write only the summary text, no headers or bullet points.`;

            const response = await ai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt });
            return response.text;
        } catch {
            // Gemini failed — use local fallback
        }
    }

    return generateLocalSummary(params);
}
