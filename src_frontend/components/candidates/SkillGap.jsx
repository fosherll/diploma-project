import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function SkillGap({ vacancyId, runId }) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!vacancyId) return;
        setLoading(true);
        const q = new URLSearchParams({ top: 50 });
        if (runId) q.set("run_id", runId);
        apiFetch(`/vacancies/${vacancyId}/skill-gap?${q}`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [vacancyId, runId]);

    if (loading) return (
        <div style={styles.card}>
            <p style={styles.hint}>Аналізуємо прогалини у навичках...</p>
        </div>
    );
    if (!data) return null;
    if (!data.available) return (
        <div style={styles.card}>
            <h3 style={styles.title}>Аналіз прогалин у навичках</h3>
            <p style={styles.hint}>{data.reason || "Дані відсутні"}</p>
        </div>
    );

    const { missing = [], partial = [], covered = [], total_candidates, total_skills } = data;

    return (
        <div style={styles.card}>
            <div style={styles.header}>
                <h3 style={styles.title}>Аналіз прогалин у навичках</h3>
                <span style={styles.meta}>
                    Топ {total_candidates} кандидатів · {total_skills} навичок вакансії
                </span>
            </div>

            {/* Зведення */}
            <div style={styles.summary}>
                <SummaryBox count={missing.length}  label="Відсутні навички"     desc="Жоден кандидат не має" bg="#fef2f2" border="#fecaca" />
                <SummaryBox count={partial.length}  label="Часткове покриття"    desc="Менше 50% кандидатів"  bg="#fff7ed" border="#fed7aa" />
                <SummaryBox count={covered.length}  label="Добре покрито"        desc="50%+ кандидатів мають" bg="#f0fdf4" border="#bbf7d0" />
            </div>

            {missing.length > 0 && (
                <SkillSection
                    title="Критичні прогалини — жоден кандидат не має цих навичок"
                    skills={missing}
                    color="#dc2626"
                    barColor="#fca5a5"
                />
            )}
            {partial.length > 0 && (
                <SkillSection
                    title="Часткове покриття"
                    skills={partial}
                    color="#ea580c"
                    barColor="#fdba74"
                />
            )}
            {covered.length > 0 && (
                <SkillSection
                    title="Добре покриті навички"
                    skills={covered}
                    color="#16a34a"
                    barColor="#86efac"
                />
            )}
        </div>
    );
}

function SummaryBox({ count, label, desc, bg, border }) {
    return (
        <div style={{ ...styles.summaryBox, background: bg, borderColor: border }}>
            <span style={styles.summaryNum}>{count}</span>
            <span style={styles.summaryLabel}>{label}</span>
            <span style={styles.summaryDesc}>{desc}</span>
        </div>
    );
}

function SkillSection({ title, skills, color, barColor }) {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? skills : skills.slice(0, 8);

    return (
        <div style={styles.section}>
            <h4 style={{ ...styles.sectionTitle, color }}>{title}</h4>
            <div style={styles.skillList}>
                {visible.map(s => (
                    <SkillRow key={s.esco_uri || s.esco_label} skill={s} color={color} barColor={barColor} />
                ))}
            </div>
            {skills.length > 8 && (
                <button style={styles.expandBtn} onClick={() => setExpanded(e => !e)}>
                    {expanded ? "Згорнути ↑" : `Показати всі ${skills.length} →`}
                </button>
            )}
        </div>
    );
}

function SkillRow({ skill, color, barColor }) {
    return (
        <div style={styles.skillRow}>
            <div style={styles.skillInfo}>
                <span style={styles.skillLabel}>{skill.esco_label}</span>
                {skill.raw_skill && <span style={styles.skillRaw}>{skill.raw_skill}</span>}
            </div>
            <div style={styles.barWrap}>
                <div style={{ ...styles.bar, width: `${skill.coverage_pct}%`, background: barColor }} />
            </div>
            <span style={{ ...styles.pct, color }}>{skill.coverage_pct}%</span>
            <span style={styles.count}>{skill.covered_by}/{skill.total_candidates}</span>
        </div>
    );
}

const styles = {
    card: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px",
        padding: "24px", display: "grid", gap: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
    header:  { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" },
    title:   { margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" },
    meta:    { fontSize: "13px", color: "#64748b" },
    hint:    { color: "#94a3b8", margin: 0, fontSize: "14px" },

    summary: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" },
    summaryBox: {
        border: "1px solid", borderRadius: "14px", padding: "16px",
        display: "grid", gap: "4px"
    },
    summaryNum:   { fontSize: "32px", fontWeight: 800, lineHeight: 1, color: "#0f172a" },
    summaryLabel: { fontSize: "14px", fontWeight: 600, color: "#374151" },
    summaryDesc:  { fontSize: "12px", color: "#64748b" },

    section:      { display: "grid", gap: "10px" },
    sectionTitle: { margin: 0, fontSize: "14px", fontWeight: 600 },
    skillList:    { display: "grid", gap: "6px" },

    skillRow: {
        display: "grid", gridTemplateColumns: "1fr 140px 50px 60px",
        gap: "12px", alignItems: "center",
        padding: "10px 14px", background: "#f8fafc",
        border: "1px solid #f1f5f9", borderRadius: "10px"
    },
    skillInfo:  { display: "grid", gap: "2px", minWidth: 0 },
    skillLabel: { fontSize: "13px", fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    skillRaw:   { fontSize: "11px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },

    barWrap: { height: "8px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" },
    bar:     { height: "100%", borderRadius: "999px" },
    pct:     { fontSize: "13px", fontWeight: 700, textAlign: "right" },
    count:   { fontSize: "12px", color: "#94a3b8", textAlign: "right" },

    expandBtn: {
        background: "none", border: "1px solid #e2e8f0", borderRadius: "8px",
        padding: "7px 14px", fontSize: "13px", color: "#2563eb",
        cursor: "pointer", fontWeight: 500, alignSelf: "flex-start"
    }
};
