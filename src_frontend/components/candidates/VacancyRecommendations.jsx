import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function VacancyRecommendations({ vacancyId, resumeId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!vacancyId || !resumeId) { setData(null); return; }
        setLoading(true);
        fetch(`/vacancies/${vacancyId}/resumes/${resumeId}/recommend-vacancies?limit=5`)
            .then(r => r.json())
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [vacancyId, resumeId]);

    if (!resumeId) return null;
    if (loading) return (
        <div style={styles.wrapper}>
            <p style={styles.hint}>Шукаємо схожі вакансії…</p>
        </div>
    );
    if (!data || !data.available) return null;

    return (
        <div style={styles.wrapper}>
            <h4 style={styles.title}>Схожі вакансії для кандидата</h4>
            <p style={styles.sub}>На основі схожості ESCO-навичок (ембединги)</p>
            <div style={styles.list}>
                {data.recommendations.map(r => (
                    <Link key={r.vacancy_id} to={`/vacancies/${r.vacancy_id}`} style={styles.card}>
                        <div style={styles.cardLeft}>
                            <span style={styles.vacTitle}>{r.title}</span>
                            <span style={styles.vacMeta}>
                                {[r.location, r.employment_type].filter(Boolean).join(" · ") || "—"}
                            </span>
                        </div>
                        <div style={styles.simWrap}>
                            <span style={styles.simNum}>{Math.round(r.similarity * 100)}%</span>
                            <span style={styles.simLabel}>збіг</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

const styles = {
    wrapper: {
        background: "#f0f7ff", border: "1px solid #bfdbfe",
        borderRadius: "14px", padding: "16px", display: "grid", gap: "10px"
    },
    title: { margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" },
    sub:   { margin: 0, fontSize: "12px", color: "#64748b" },
    hint:  { margin: 0, color: "#64748b", fontSize: "13px" },
    list:  { display: "grid", gap: "8px" },
    card: {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#fff", border: "1px solid #dbeafe", borderRadius: "10px",
        padding: "10px 14px", textDecoration: "none", color: "inherit", gap: "12px",
        transition: "box-shadow 0.15s"
    },
    cardLeft: { display: "grid", gap: "2px", minWidth: 0 },
    vacTitle: { fontSize: "14px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    vacMeta:  { fontSize: "12px", color: "#64748b" },
    simWrap:  { display: "grid", textAlign: "center", flexShrink: 0 },
    simNum:   { fontSize: "18px", fontWeight: 700, color: "#2563eb" },
    simLabel: { fontSize: "11px", color: "#64748b" }
};
