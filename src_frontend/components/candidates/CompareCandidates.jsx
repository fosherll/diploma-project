import RadarChart from "./RadarChart.jsx";

function formatFailedCriteria(list) {
    if (!Array.isArray(list) || list.length === 0) return "—";
    return list.map((item) => item?.name || item?.calc_type || "Unknown").join(", ");
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
                <strong>Required criteria:</strong> not evaluated for this run
            </div>
        );
    }

    const requiredTotal = Number(meta.required_total ?? 0);
    const requiredPassed = Number(meta.required_passed ?? 0);
    const requiredPenalty = Number(meta.required_penalty ?? 0);
    const passedAllRequired = Boolean(meta.passed_all_required);
    const failedRequiredCriteria = meta.failed_required_criteria || [];

    if (requiredTotal === 0) {
        return (
            <div style={styles.requiredCardMuted}>
                <div style={styles.requiredHeader}>
                    <strong>Required criteria</strong>
                    <span style={styles.requiredBadge}>Not configured</span>
                </div>
                <div style={styles.requiredGrid}>
                    <div>
                        <span style={styles.mutedSmall}>Passed</span>
                        <div><strong>0 / 0</strong></div>
                    </div>

                    <div>
                        <span style={styles.mutedSmall}>Penalty</span>
                        <div><strong>0</strong></div>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                        <span style={styles.mutedSmall}>Failed required criteria</span>
                        <div><strong>—</strong></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                ...styles.requiredCard,
                ...(passedAllRequired ? styles.requiredOk : styles.requiredFail)
            }}
        >
            <div style={styles.requiredHeader}>
                <strong>Required criteria</strong>
                <span style={styles.requiredBadge}>
                    {passedAllRequired ? "Passed" : "Failed"}
                </span>
            </div>

            <div style={styles.requiredGrid}>
                <div>
                    <span style={styles.mutedSmall}>Passed</span>
                    <div><strong>{requiredPassed} / {requiredTotal}</strong></div>
                </div>

                <div>
                    <span style={styles.mutedSmall}>Penalty</span>
                    <div><strong>{requiredPenalty}</strong></div>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                    <span style={styles.mutedSmall}>Failed required criteria</span>
                    <div><strong>{formatFailedCriteria(failedRequiredCriteria)}</strong></div>
                </div>
            </div>
        </div>
    );
}
export default function CompareCandidates({
                                              compareData,
                                              selectedCompareIds,
                                              onToggleCandidate,
                                              topItems
                                          }) {
    const compareItems = Array.isArray(compareData?.items) ? compareData.items : [];

    return (
        <div style={styles.card}>
            <h3 style={styles.title}>Compare candidates</h3>

            <div style={styles.selectorBlock}>
                <p style={styles.label}>Select 2 candidates for comparison:</p>

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
                                    {item.candidate_name || "Unknown"} ({item.resume_id})
                                </span>
                            </label>
                        );
                    })}
                </div>
            </div>

            {compareItems.length !== 2 ? (
                <p>Select exactly 2 candidates to view comparison.</p>
            ) : (
                <RadarChart candidates={compareItems} />
            )}

            {compareItems.length === 2 && (
                <div style={styles.columns}>
                    {compareItems.map((candidate) => (
                        <div key={candidate.resume_id} style={styles.compareColumn}>
                            <div style={styles.topCard}>
                                <h4 style={{ marginTop: 0 }}>{candidate.candidate_name || "Unknown"}</h4>
                                <p><strong>Resume ID:</strong> {candidate.resume_id}</p>
                                <p><strong>City:</strong> {candidate.city || "—"}</p>
                                <p><strong>Total score:</strong> {candidate.total_score}</p>

                                <RequiredMiniCard meta={candidate.meta} />
                            </div>

                            <div style={styles.detailsList}>
                                {(candidate.details || []).map((detail, index) => (
                                    <div key={`${candidate.resume_id}-${index}`} style={styles.detailCard}>
                                        <p><strong>{detail.name}</strong></p>
                                        <p><span style={styles.muted}>Type:</span> {detail.calc_type}</p>
                                        <p><span style={styles.muted}>Raw score:</span> {detail.raw_score}</p>
                                        <p><span style={styles.muted}>Weighted score:</span> {detail.weighted_score}</p>
                                        <p>{detail.explanation}</p>
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
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "12px",
        padding: "16px"
    },
    title: {
        marginTop: 0
    },
    selectorBlock: {
        marginBottom: "16px"
    },
    label: {
        marginBottom: "8px"
    },
    checkboxGrid: {
        display: "grid",
        gap: "8px",
        marginBottom: "16px"
    },
    checkboxItem: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
    },
    columns: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "18px"
    },
    compareColumn: {
        display: "grid",
        gap: "12px"
    },
    topCard: {
        background: "#f7f9fc",
        borderRadius: "10px",
        padding: "14px"
    },
    detailsList: {
        display: "grid",
        gap: "10px"
    },
    detailCard: {
        background: "#fafafa",
        borderRadius: "10px",
        padding: "12px",
        border: "1px solid #f0f0f0"
    },
    muted: {
        color: "#666"
    },
    mutedSmall: {
        color: "#64748b",
        fontSize: "12px"
    },
    requiredCard: {
        marginTop: "10px",
        borderRadius: "10px",
        padding: "10px",
        border: "1px solid"
    },
    requiredOk: {
        background: "#f0fdf4",
        borderColor: "#86efac"
    },
    requiredFail: {
        background: "#fff7ed",
        borderColor: "#fdba74"
    },
    requiredCardMuted: {
        marginTop: "10px",
        borderRadius: "10px",
        padding: "10px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0"
    },
    requiredHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "10px",
        marginBottom: "10px"
    },
    requiredBadge: {
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "999px",
        padding: "4px 8px",
        fontSize: "12px",
        fontWeight: 700
    },
    requiredGrid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px"
    }
};