export default function CandidateSummary({ summary }) {
    if (!summary) {
        return (
            <div style={styles.empty}>
                Оберіть кандидата зі списку щоб побачити деталі
            </div>
        );
    }

    const meta   = summary?.meta || {};
    const score  = Number(summary.total_score ?? 0);

    const requiredTotal  = Number(meta.required_total  ?? 0);
    const requiredPassed = Number(meta.required_passed ?? 0);
    const passedAll      = Boolean(meta.passed_all_required);
    const failedList     = meta.failed_required_criteria || [];

    const reqState = requiredTotal === 0 ? "none"
        : passedAll ? "ok" : "fail";

    const scoreColor = score >= 7 ? "#16a34a" : score >= 4 ? "#d97706" : "#dc2626";
    const scoreBg    = score >= 7 ? "#f0fdf4" : score >= 4 ? "#fffbeb" : "#fef2f2";
    const scoreLabel = score >= 7 ? "Сильний кандидат" : score >= 4 ? "Перспективний" : "Не відповідає";

    return (
        <div style={styles.card}>

            {/* Шапка */}
            <div style={styles.topRow}>
                <div>
                    <div style={styles.candidateName}>
                        {meta.candidate_name || "Невідомий кандидат"}
                    </div>
                    <div style={styles.candidateCity}>{meta.city || "—"}</div>
                </div>
                <div style={{ ...styles.scoreBig, color: scoreColor, background: scoreBg }}>
                    <div style={styles.scoreNum}>{score.toFixed(2)}</div>
                    <div style={styles.scoreLabel}>{scoreLabel}</div>
                </div>
            </div>

            {/* Обов'язкові критерії */}
            {requiredTotal > 0 && (
                <div style={{ ...styles.requiredBox, ...(reqState === "ok" ? styles.reqOk : styles.reqFail) }}>
                    <div style={styles.requiredRow}>
                        <span style={styles.requiredTitle}>Обов'язкові критерії</span>
                        <span style={{ ...styles.reqBadge, ...(reqState === "ok" ? styles.badgeOk : styles.badgeFail) }}>
                            {passedAll ? "✓ Пройдено" : "✗ Не пройдено"}
                        </span>
                    </div>
                    <div style={styles.requiredCount}>
                        {requiredPassed} / {requiredTotal} критеріїв пройдено
                    </div>
                    {failedList.length > 0 && (
                        <div style={styles.failedList}>
                            Провалені: {failedList.map(f => f.name || f.calc_type).join(", ")}
                        </div>
                    )}
                </div>
            )}

            {/* Сильні та слабкі сторони */}
            <div style={styles.columns}>
                <div style={styles.block}>
                    <div style={styles.blockTitle}>
                        <span style={styles.dotGreen} /> Сильні сторони
                    </div>
                    {summary.strengths?.length ? (
                        <ul style={styles.list}>
                            {summary.strengths.map((item, i) => (
                                <li key={i} style={styles.listItem}>
                                    <span style={styles.itemName}>{item.name}</span>
                                    <span style={styles.itemExpl}>{item.explanation}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <span style={styles.empty2}>—</span>
                    )}
                </div>

                <div style={styles.block}>
                    <div style={styles.blockTitle}>
                        <span style={styles.dotRed} /> Слабкі сторони
                    </div>
                    {summary.weaknesses?.length ? (
                        <ul style={styles.list}>
                            {summary.weaknesses.map((item, i) => (
                                <li key={i} style={styles.listItem}>
                                    <span style={styles.itemName}>{item.name}</span>
                                    <span style={styles.itemExpl}>{item.explanation}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <span style={styles.empty2}>—</span>
                    )}
                </div>
            </div>
        </div>
    );
}

const styles = {
    card: {
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "24px",
        display: "grid",
        gap: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
    empty: {
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "40px",
        textAlign: "center",
        color: "#94a3b8",
        fontSize: "14px"
    },
    topRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "16px"
    },
    candidateName: { fontSize: "20px", fontWeight: 700, color: "#0f172a", marginBottom: "4px" },
    candidateCity: { fontSize: "14px", color: "#64748b" },

    scoreBig: {
        borderRadius: "14px",
        padding: "12px 20px",
        textAlign: "center",
        minWidth: "100px",
        flexShrink: 0
    },
    scoreNum:   { fontSize: "28px", fontWeight: 800, lineHeight: 1 },
    scoreLabel: { fontSize: "11px", fontWeight: 600, marginTop: "4px", opacity: 0.8 },

    requiredBox: {
        border: "1px solid",
        borderRadius: "12px",
        padding: "14px 16px",
        display: "grid",
        gap: "6px"
    },
    reqOk:   { background: "#f0fdf4", borderColor: "#bbf7d0" },
    reqFail: { background: "#fff7ed", borderColor: "#fed7aa" },
    requiredRow:  { display: "flex", justifyContent: "space-between", alignItems: "center" },
    requiredTitle: { fontSize: "13px", fontWeight: 600, color: "#374151" },
    requiredCount: { fontSize: "13px", color: "#475569" },
    failedList:    { fontSize: "12px", color: "#92400e" },

    reqBadge: {
        fontSize: "12px", fontWeight: 600, padding: "3px 10px",
        borderRadius: "999px", border: "1px solid"
    },
    badgeOk:   { color: "#16a34a", borderColor: "#86efac", background: "#fff" },
    badgeFail: { color: "#dc2626", borderColor: "#fca5a5", background: "#fff" },

    columns: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px"
    },
    block: {
        background: "#f8fafc",
        border: "1px solid #f1f5f9",
        borderRadius: "12px",
        padding: "14px 16px",
        display: "grid",
        gap: "10px"
    },
    blockTitle: {
        fontSize: "13px",
        fontWeight: 600,
        color: "#374151",
        display: "flex",
        alignItems: "center",
        gap: "8px"
    },
    dotGreen: {
        width: "8px", height: "8px", borderRadius: "50%",
        background: "#16a34a", display: "inline-block", flexShrink: 0
    },
    dotRed: {
        width: "8px", height: "8px", borderRadius: "50%",
        background: "#dc2626", display: "inline-block", flexShrink: 0
    },
    list:    { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "8px" },
    listItem: { display: "grid", gap: "2px" },
    itemName: { fontSize: "13px", fontWeight: 600, color: "#1e293b" },
    itemExpl: { fontSize: "12px", color: "#64748b" },
    empty2:   { fontSize: "13px", color: "#94a3b8" }
};
