import { useEffect, useState } from "react";

export default function SkillGap({ vacancyId, runId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!vacancyId) return;
        setLoading(true);
        const query = new URLSearchParams({ top: 20 });
        if (runId) query.set("run_id", runId);
        fetch(`/vacancies/${vacancyId}/skill-gap?${query}`)
            .then(r => r.json())
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [vacancyId, runId]);

    if (loading) return <div style={styles.wrapper}><p style={styles.hint}>Analyzing skill gaps...</p></div>;
    if (!data) return null;
    if (!data.available) return (
        <div style={styles.wrapper}>
            <h3 style={styles.title}>Skill gap analysis</h3>
            <p style={styles.hint}>{data.reason}</p>
        </div>
    );

    const { missing, partial, covered, total_candidates, total_skills } = data;

    return (
        <div style={styles.wrapper}>
            <div style={styles.header}>
                <h3 style={styles.title}>Skill gap analysis</h3>
                <span style={styles.meta}>Top {total_candidates} candidates · {total_skills} required skills</span>
            </div>

            <div style={styles.summary}>
                <div style={{ ...styles.summaryBox, background: "#fef2f2", borderColor: "#fecaca" }}>
                    <span style={styles.summaryNum}>{missing.length}</span>
                    <span style={styles.summaryLabel}>Missing skills</span>
                    <span style={styles.summaryDesc}>No candidate has these</span>
                </div>
                <div style={{ ...styles.summaryBox, background: "#fff7ed", borderColor: "#fed7aa" }}>
                    <span style={styles.summaryNum}>{partial.length}</span>
                    <span style={styles.summaryLabel}>Partial coverage</span>
                    <span style={styles.summaryDesc}>Less than 50% of candidates</span>
                </div>
                <div style={{ ...styles.summaryBox, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                    <span style={styles.summaryNum}>{covered.length}</span>
                    <span style={styles.summaryLabel}>Well covered</span>
                    <span style={styles.summaryDesc}>50%+ of candidates have it</span>
                </div>
            </div>

            {missing.length > 0 && (
                <div style={styles.section}>
                    <h4 style={styles.sectionTitle}>Critical gaps — no candidate has these skills</h4>
                    <div style={styles.skillList}>
                        {missing.map(s => (
                            <SkillRow key={s.esco_uri} skill={s} color="#dc2626" barColor="#fca5a5" />
                        ))}
                    </div>
                </div>
            )}

            {partial.length > 0 && (
                <div style={styles.section}>
                    <h4 style={styles.sectionTitle}>Partial coverage</h4>
                    <div style={styles.skillList}>
                        {partial.map(s => (
                            <SkillRow key={s.esco_uri} skill={s} color="#ea580c" barColor="#fdba74" />
                        ))}
                    </div>
                </div>
            )}

            {covered.length > 0 && (
                <div style={styles.section}>
                    <h4 style={styles.sectionTitle}>Well covered skills</h4>
                    <div style={styles.skillList}>
                        {covered.map(s => (
                            <SkillRow key={s.esco_uri} skill={s} color="#16a34a" barColor="#86efac" />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SkillRow({ skill, color, barColor }) {
    return (
        <div style={styles.skillRow}>
            <div style={styles.skillInfo}>
                <span style={styles.skillLabel}>{skill.esco_label}</span>
                <span style={styles.skillRaw}>{skill.raw_skill}</span>
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
    wrapper: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "20px", display: "grid", gap: "16px" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" },
    title: { margin: 0 },
    meta: { fontSize: "13px", color: "#64748b" },
    hint: { color: "#64748b", margin: 0 },
    summary: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" },
    summaryBox: { border: "1px solid", borderRadius: "12px", padding: "14px", display: "grid", gap: "4px" },
    summaryNum: { fontSize: "28px", fontWeight: 700, lineHeight: 1 },
    summaryLabel: { fontSize: "14px", fontWeight: 600 },
    summaryDesc: { fontSize: "12px", color: "#64748b" },
    section: { display: "grid", gap: "8px" },
    sectionTitle: { margin: 0, fontSize: "14px", color: "#374151" },
    skillList: { display: "grid", gap: "6px" },
    skillRow: { display: "grid", gridTemplateColumns: "1fr 120px 44px 60px", gap: "10px", alignItems: "center", padding: "8px 10px", background: "#f8fafc", borderRadius: "8px" },
    skillInfo: { display: "grid", gap: "2px", minWidth: 0 },
    skillLabel: { fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    skillRaw: { fontSize: "11px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    barWrap: { height: "8px", background: "#e5e7eb", borderRadius: "999px", overflow: "hidden" },
    bar: { height: "100%", borderRadius: "999px", transition: "width 0.3s" },
    pct: { fontSize: "13px", fontWeight: 700, textAlign: "right" },
    count: { fontSize: "12px", color: "#94a3b8", textAlign: "right" }
};
