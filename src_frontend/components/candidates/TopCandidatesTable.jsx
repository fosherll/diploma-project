import { useMemo } from "react";

// Пороги для кольорування балу кандидата
const SCORE_GOOD = 7;
const SCORE_OK   = 4;

// Пороги для кольорування ESCO схожості
const ESCO_SIM_GOOD = 0.5;
const ESCO_SIM_OK   = 0.3;

function getScoreStyle(score) {
    if (score >= SCORE_GOOD) return { color: "#16a34a", background: "#f0fdf4" };
    if (score >= SCORE_OK)   return { color: "#d97706", background: "#fffbeb" };
    return                          { color: "#dc2626", background: "#fef2f2" };
}

function getEscoColor(sim) {
    if (sim >= ESCO_SIM_GOOD) return "#16a34a";
    if (sim >= ESCO_SIM_OK)   return "#d97706";
    return                           "#64748b";
}

export default function TopCandidatesTable({ items, selectedResumeId, onSelect }) {
    if (!items?.length) {
        return (
            <div style={styles.empty}>
                Кандидатів не знайдено. Запустіть скоринг.
            </div>
        );
    }

    const hasEscoSim = useMemo(
        () => items.some(it => it.esco_skill_sim != null),
        [items]
    );

    return (
        <div style={styles.wrapper}>
            {hasEscoSim && (
                <div style={styles.escoBanner}>
                    🎯 Кандидати підібрані за схожістю ESCO навичок
                </div>
            )}
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>Кандидат</th>
                        <th style={styles.th}>Місто</th>
                        {hasEscoSim && <th style={styles.th}>ESCO схожість</th>}
                        <th style={styles.th}>Бал</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => {
                        const selected   = String(item.resume_id) === String(selectedResumeId);
                        const score      = Number(item.total_score);
                        const escoSim    = item.esco_skill_sim != null ? Number(item.esco_skill_sim) : null;

                        return (
                            <tr
                                key={item.resume_id}
                                onClick={() => onSelect?.(item)}
                                style={{ ...styles.row, ...(selected ? styles.rowSelected : {}) }}
                            >
                                <td style={{ ...styles.td, color: "#94a3b8", width: "40px" }}>
                                    {idx + 1}
                                </td>
                                <td style={styles.td}>
                                    <span style={styles.name}>{item.candidate_name || "—"}</span>
                                </td>
                                <td style={{ ...styles.td, color: "#64748b" }}>
                                    {item.city || "—"}
                                </td>
                                {hasEscoSim && (
                                    <td style={styles.td}>
                                        {escoSim != null ? (
                                            <span style={{ ...styles.simBadge, color: getEscoColor(escoSim) }}>
                                                {(escoSim * 100).toFixed(0)}%
                                            </span>
                                        ) : (
                                            <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>
                                        )}
                                    </td>
                                )}
                                <td style={styles.td}>
                                    <span style={{ ...styles.scoreBadge, ...getScoreStyle(score) }}>
                                        {score.toFixed(2)}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

const styles = {
    wrapper: {
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        overflow: "hidden"
    },
    escoBanner: {
        padding: "8px 16px",
        background: "#f0fdf4",
        borderBottom: "1px solid #bbf7d0",
        fontSize: "12px",
        color: "#15803d",
        fontWeight: 500
    },
    table: {
        width: "100%",
        borderCollapse: "collapse"
    },
    th: {
        textAlign: "left",
        padding: "12px 16px",
        borderBottom: "1px solid #e2e8f0",
        background: "#f8fafc",
        fontSize: "12px",
        fontWeight: 600,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: "0.05em"
    },
    td: {
        padding: "13px 16px",
        borderBottom: "1px solid #f1f5f9",
        fontSize: "14px",
        color: "#0f172a"
    },
    row: {
        cursor: "pointer",
        transition: "background 0.1s"
    },
    rowSelected: {
        background: "#eff6ff"
    },
    name: {
        fontWeight: 500
    },
    scoreBadge: {
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "13px",
        fontWeight: 700
    },
    simBadge: {
        display: "inline-block",
        fontWeight: 600,
        fontSize: "13px"
    },
    empty: {
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "32px",
        textAlign: "center",
        color: "#94a3b8",
        fontSize: "14px"
    }
};
