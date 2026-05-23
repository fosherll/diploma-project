import RadarChart from "./RadarChart.jsx";

function formatFailedCriteria(list) {
    if (!Array.isArray(list) || list.length === 0) return "—";
    return list.map((item) => item?.name || item?.calc_type || "Невідомо").join(", ");
}

function RequiredMiniCard({ meta }) {
    if (!meta || typeof meta !== "object") return null;

    const hasRequiredInfo =
        meta.required_total !== undefined ||
        meta.required_passed !== undefined ||
        meta.passed_all_required !== undefined;

    if (!hasRequiredInfo) {
        return (
            <div style={styles.requiredCardMuted}>
                <strong>Обов'язкові критерії:</strong> не оцінювалися в цьому запуску
            </div>
        );
    }

    const requiredTotal   = Number(meta.required_total ?? 0);
    const requiredPassed  = Number(meta.required_passed ?? 0);
    const requiredPenalty = Number(meta.required_penalty ?? 0);
    const passedAll       = Boolean(meta.passed_all_required);
    const failedList      = meta.failed_required_criteria || [];

    if (requiredTotal === 0) {
        return (
            <div style={styles.requiredCardMuted}>
                <div style={styles.requiredHeader}>
                    <strong>Обов'язкові критерії</strong>
                    <span style={styles.requiredBadge}>Не налаштовано</span>
                </div>
                <div style={styles.requiredGrid}>
                    <MiniStat label="Пройдено" value="0 / 0" />
                    <MiniStat label="Штраф" value="0" />
                    <div style={{ gridColumn: "1 / -1" }}>
                        <MiniStat label="Провалені критерії" value="—" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ ...styles.requiredCard, ...(passedAll ? styles.requiredOk : styles.requiredFail) }}>
            <div style={styles.requiredHeader}>
                <strong>Обов'язкові критерії</strong>
                <span style={{ ...styles.requiredBadge, color: passedAll ? "#16a34a" : "#dc2626" }}>
                    {passedAll ? "✓ Пройдено" : "✗ Провалено"}
                </span>
            </div>
            <div style={styles.requiredGrid}>
                <MiniStat label="Пройдено" value={`${requiredPassed} / ${requiredTotal}`} />
                <MiniStat label="Штраф" value={requiredPenalty} />
                <div style={{ gridColumn: "1 / -1" }}>
                    <MiniStat label="Провалені критерії" value={formatFailedCriteria(failedList)} />
                </div>
            </div>
        </div>
    );
}

function MiniStat({ label, value }) {
    return (
        <div>
            <span style={styles.mutedSmall}>{label}</span>
            <div><strong>{value}</strong></div>
        </div>
    );
}

export default function CompareCandidates({ compareData, selectedCompareIds, onToggleCandidate, topItems }) {
    const compareItems = Array.isArray(compareData?.items) ? compareData.items : [];

    return (
        <div style={styles.card}>
            <h3 style={styles.title}>Порівняння кандидатів</h3>

            <div style={styles.selectorBlock}>
                <p style={styles.label}>Оберіть 2 кандидати для порівняння:</p>
                <div style={styles.checkboxGrid}>
                    {(topItems || []).map((item) => {
                        const checked = selectedCompareIds.includes(String(item.resume_id));
                        return (
                            <label key={item.resume_id} style={styles.checkboxItem}>
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggleCandidate?.(String(item.resume_id))}
                                />
                                <span>
                                    {item.candidate_name || "Невідомо"}{" "}
                                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>({item.resume_id})</span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </div>

            {compareItems.length !== 2 ? (
                <p style={styles.hint}>Оберіть рівно 2 кандидати для перегляду порівняння.</p>
            ) : (
                <RadarChart candidates={compareItems} />
            )}

            {compareItems.length === 2 && (
                <div style={styles.columns}>
                    {compareItems.map((candidate) => (
                        <div key={candidate.resume_id} style={styles.compareColumn}>
                            <div style={styles.topCard}>
                                <h4 style={styles.candName}>{candidate.candidate_name || "Невідомо"}</h4>
                                <div style={styles.candMeta}>
                                    <span><strong>Resume ID:</strong> {candidate.resume_id}</span>
                                    <span><strong>Місто:</strong> {candidate.city || "—"}</span>
                                    <span style={styles.scoreRow}>
                                        <strong>Загальний скор:</strong>
                                        <span style={styles.scoreBadge}>{Number(candidate.total_score).toFixed(2)}</span>
                                    </span>
                                </div>
                                <RequiredMiniCard meta={candidate.meta} />
                            </div>

                            <div style={styles.detailsList}>
                                {(candidate.details || []).map((detail, index) => (
                                    <div key={`${candidate.resume_id}-${index}`} style={styles.detailCard}>
                                        <div style={styles.detailHeader}>
                                            <strong style={styles.detailName}>{detail.name}</strong>
                                            <span style={styles.detailType}>{detail.calc_type}</span>
                                        </div>
                                        <div style={styles.detailScores}>
                                            <span style={styles.muted}>Сирий скор: <strong>{detail.raw_score}</strong></span>
                                            <span style={styles.muted}>З вагою: <strong>{detail.weighted_score}</strong></span>
                                        </div>
                                        {detail.explanation && (
                                            <p style={styles.explanation}>{detail.explanation}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const styles = {
    card: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px",
        padding: "24px", display: "grid", gap: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
    title:  { margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" },
    label:  { margin: "0 0 8px", fontSize: "14px", color: "#374151" },
    hint:   { margin: 0, color: "#94a3b8", fontSize: "14px" },

    selectorBlock: { display: "grid", gap: "4px" },
    checkboxGrid: { display: "grid", gap: "6px" },
    checkboxItem: { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" },

    columns: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" },
    compareColumn: { display: "grid", gap: "12px" },

    topCard: {
        background: "#f8fafc", border: "1px solid #e2e8f0",
        borderRadius: "14px", padding: "16px", display: "grid", gap: "10px"
    },
    candName: { margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" },
    candMeta: { display: "grid", gap: "4px", fontSize: "13px", color: "#374151" },
    scoreRow: { display: "flex", alignItems: "center", gap: "8px" },
    scoreBadge: {
        background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px",
        padding: "2px 10px", borderRadius: "6px"
    },

    detailsList: { display: "grid", gap: "8px" },
    detailCard: {
        background: "#f8fafc", border: "1px solid #f1f5f9",
        borderRadius: "10px", padding: "12px", display: "grid", gap: "6px"
    },
    detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" },
    detailName: { fontSize: "13px", color: "#0f172a" },
    detailType: {
        fontSize: "11px", color: "#3730a3", background: "#eef2ff",
        padding: "2px 8px", borderRadius: "4px", fontWeight: 600, flexShrink: 0
    },
    detailScores: { display: "flex", gap: "16px", fontSize: "12px" },
    explanation: { margin: 0, fontSize: "12px", color: "#64748b", lineHeight: 1.5 },

    muted:      { color: "#64748b" },
    mutedSmall: { color: "#64748b", fontSize: "12px" },

    requiredCard: {
        borderRadius: "10px", padding: "12px", border: "1px solid"
    },
    requiredOk:   { background: "#f0fdf4", borderColor: "#86efac" },
    requiredFail: { background: "#fff7ed", borderColor: "#fdba74" },
    requiredCardMuted: {
        borderRadius: "10px", padding: "12px",
        background: "#f8fafc", border: "1px solid #e2e8f0"
    },
    requiredHeader: {
        display: "flex", justifyContent: "space-between",
        alignItems: "center", gap: "10px", marginBottom: "10px"
    },
    requiredBadge: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "999px",
        padding: "3px 10px", fontSize: "12px", fontWeight: 700
    },
    requiredGrid: {
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px"
    }
};
