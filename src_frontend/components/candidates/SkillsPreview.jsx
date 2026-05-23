import { useState } from "react";

/** Скільки навичок кандидата показувати до кнопки «Показати всі» */
const CV_SKILLS_PREVIEW_LIMIT = 12;

export default function SkillsPreview({ preview }) {
    if (!preview || preview.available === false) return null;

    const matched  = preview.matched   ?? [];
    const missing  = preview.missing   ?? [];
    const cvSkills = preview.cv_skills ?? [];
    if (matched.length === 0 && missing.length === 0 && cvSkills.length === 0) return null;

    return (
        <div style={styles.card}>
            <div style={styles.header}>
                <h3 style={styles.title}>Порівняння ESCO навичок</h3>
                <div style={styles.legend}>
                    <span style={styles.legendItem}>
                        <span style={{ ...styles.dot, background: "#16a34a" }} /> Є у кандидата
                    </span>
                    <span style={styles.legendItem}>
                        <span style={{ ...styles.dot, background: "#dc2626" }} /> Відсутні
                    </span>
                </div>
            </div>

            {/* Порівняння: збіги / відсутні */}
            <div style={styles.columns}>
                {/* Збіги */}
                <div style={styles.block}>
                    <div style={styles.blockHeader}>
                        <span style={{ ...styles.blockTitle, color: "#15803d" }}>
                            ✓ Наявні навички
                        </span>
                        <span style={styles.blockCount}>{matched.length}</span>
                    </div>
                    {matched.length === 0
                        ? <p style={styles.empty}>Збігів не знайдено</p>
                        : (
                            <div style={styles.list}>
                                {matched.map(s => (
                                    <div key={s.esco_label} style={styles.matchedItem}>
                                        <span style={styles.skillLabel}>{s.esco_label}</span>
                                        <span style={styles.confBadge}>
                                            {Math.round(s.cv_confidence * 100)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )
                    }
                </div>

                {/* Відсутні */}
                <div style={styles.block}>
                    <div style={styles.blockHeader}>
                        <span style={{ ...styles.blockTitle, color: "#b91c1c" }}>
                            ✗ Відсутні у кандидата
                        </span>
                        <span style={styles.blockCount}>{missing.length}</span>
                    </div>
                    {missing.length === 0
                        ? <p style={styles.empty}>Всі навички присутні</p>
                        : (
                            <div style={styles.list}>
                                {missing.map(s => (
                                    <div key={s.esco_label} style={styles.missingItem}>
                                        <span style={styles.skillLabel}>{s.esco_label}</span>
                                        <span style={{ ...styles.confBadge, color: "#dc2626", background: "#fef2f2", borderColor: "#fecaca" }}>
                                            {Math.round(s.vacancy_confidence * 100)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )
                    }
                </div>
            </div>

            {/* Всі навички кандидата */}
            {cvSkills.length > 0 && (
                <CandidateSkillsSection cvSkills={cvSkills} />
            )}
        </div>
    );
}

function CandidateSkillsSection({ cvSkills }) {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? cvSkills : cvSkills.slice(0, CV_SKILLS_PREVIEW_LIMIT);

    return (
        <div style={styles.cvSection}>
            <div style={styles.blockHeader}>
                <span style={{ ...styles.blockTitle, color: "#1d4ed8" }}>
                    📋 Усі навички кандидата
                </span>
                <span style={styles.blockCount}>{cvSkills.length}</span>
            </div>
            <div style={styles.cvGrid}>
                {visible.map(s => (
                    <div
                        key={s.esco_label}
                        style={s.matched_vacancy ? styles.cvItemMatched : styles.cvItemDefault}
                    >
                        <span style={styles.skillLabel}>{s.esco_label}</span>
                        <span style={s.matched_vacancy ? styles.confBadgeMatched : styles.confBadgeDefault}>
                            {Math.round(s.confidence * 100)}%
                        </span>
                    </div>
                ))}
            </div>
            {cvSkills.length > CV_SKILLS_PREVIEW_LIMIT && (
                <button style={styles.expandBtn} onClick={() => setExpanded(e => !e)}>
                    {expanded ? "Згорнути ↑" : `Показати всі ${cvSkills.length} →`}
                </button>
            )}
        </div>
    );
}

const styles = {
    card: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px",
        padding: "22px", display: "grid", gap: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" },
    title:  { margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" },
    legend: { display: "flex", gap: "16px" },
    legendItem: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#64748b" },
    dot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },

    columns: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" },
    block: {
        background: "#f8fafc", border: "1px solid #f1f5f9",
        borderRadius: "12px", padding: "14px", display: "grid", gap: "10px"
    },
    blockHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    blockTitle:  { fontSize: "13px", fontWeight: 700 },
    blockCount: {
        background: "#e2e8f0", color: "#475569", borderRadius: "999px",
        padding: "1px 9px", fontSize: "12px", fontWeight: 700
    },

    list:  { display: "grid", gap: "5px", maxHeight: "320px", overflowY: "auto" },
    matchedItem: {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#f0fdf4", border: "1px solid #bbf7d0",
        borderRadius: "7px", padding: "5px 10px", gap: "8px"
    },
    missingItem: {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#fff7f7", border: "1px solid #fecaca",
        borderRadius: "7px", padding: "5px 10px", gap: "8px"
    },
    skillLabel: {
        fontSize: "12px", fontWeight: 500, color: "#1e293b",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1
    },
    confBadge: {
        fontSize: "11px", fontWeight: 600, color: "#16a34a",
        background: "#dcfce7", border: "1px solid #bbf7d0",
        borderRadius: "4px", padding: "1px 6px", flexShrink: 0
    },
    confBadgeMatched: {
        fontSize: "11px", fontWeight: 600, color: "#15803d",
        background: "#dcfce7", border: "1px solid #bbf7d0",
        borderRadius: "4px", padding: "1px 6px", flexShrink: 0
    },
    confBadgeDefault: {
        fontSize: "11px", fontWeight: 600, color: "#475569",
        background: "#e2e8f0", border: "1px solid #cbd5e1",
        borderRadius: "4px", padding: "1px 6px", flexShrink: 0
    },
    empty: { margin: 0, fontSize: "13px", color: "#94a3b8" },

    cvSection: {
        borderTop: "1px solid #e2e8f0", paddingTop: "16px",
        display: "grid", gap: "10px"
    },
    cvGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "6px"
    },
    cvItemMatched: {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        border: "1px solid #86efac", borderRadius: "7px", padding: "5px 10px", gap: "8px",
        background: "#f0fdf4"
    },
    cvItemDefault: {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        border: "1px solid #e2e8f0", borderRadius: "7px", padding: "5px 10px", gap: "8px",
        background: "#f8fafc"
    },
    expandBtn: {
        background: "none", border: "1px solid #e2e8f0", borderRadius: "8px",
        padding: "7px 14px", fontSize: "13px", color: "#2563eb",
        cursor: "pointer", fontWeight: 500, alignSelf: "flex-start"
    },
};
