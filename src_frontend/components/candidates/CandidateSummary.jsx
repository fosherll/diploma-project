import { useState } from "react";

function formatFailedCriteria(list) {
    if (!Array.isArray(list) || list.length === 0) return "—";
    return list.map((item) => item?.name || item?.calc_type || "Unknown").join(", ");
}

async function fetchAiSummary(vacancyId, resumeId, payload) {
    const res = await fetch(`/vacancies/${vacancyId}/resumes/${resumeId}/ai-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.summary;
}

export default function CandidateSummary({ summary, vacancyId, vacancyTitle }) {
    if (!summary) {
        return <p>Select a candidate to view summary.</p>;
    }

    const meta = summary?.meta || {};

    const hasRequiredInfo =
        meta.required_total !== undefined ||
        meta.required_passed !== undefined ||
        meta.passed_all_required !== undefined;

    const requiredTotal = Number(meta.required_total ?? 0);
    const requiredPassed = Number(meta.required_passed ?? 0);
    const requiredPenalty = Number(meta.required_penalty ?? 0);
    const passedAllRequired = Boolean(meta.passed_all_required);
    const failedRequiredCriteria = meta.failed_required_criteria || [];

    const hasConfiguredRequiredCriteria = hasRequiredInfo && requiredTotal > 0;

    let requiredState = "not_evaluated";
    if (hasRequiredInfo && requiredTotal === 0) {
        requiredState = "not_configured";
    } else if (hasConfiguredRequiredCriteria && passedAllRequired) {
        requiredState = "passed";
    } else if (hasConfiguredRequiredCriteria && !passedAllRequired) {
        requiredState = "failed";
    }

    const requiredBoxStyle =
        requiredState === "passed"
            ? styles.requiredOk
            : requiredState === "failed"
                ? styles.requiredFail
                : styles.requiredMuted;

    const requiredBadgeText =
        requiredState === "passed"
            ? "Passed"
            : requiredState === "failed"
                ? "Failed"
                : requiredState === "not_configured"
                    ? "Not configured"
                    : "Not evaluated";

    const [aiSummary, setAiSummary] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);

    async function handleGenerateAi() {
        setAiLoading(true);
        setAiError(null);
        try {
            const matchedSkills = (summary.strengths || [])
                .filter(s => s.calc_type === "skill_mapping_match" || s.calc_type === "semantic_skill_match")
                .map(s => s.explanation);
            const missingSkills = (summary.weaknesses || [])
                .filter(w => w.calc_type === "skill_mapping_match" || w.calc_type === "semantic_skill_match")
                .map(w => w.explanation);

            const text = await fetchAiSummary(vacancyId, summary.resume_id, {
                vacancyTitle: vacancyTitle || "",
                candidateName: summary.meta?.candidate_name || "",
                candidateCity: summary.meta?.city || "",
                totalScore: summary.total_score,
                strengths: summary.strengths || [],
                weaknesses: summary.weaknesses || [],
                matchedSkills,
                missingSkills
            });
            setAiSummary(text);
        } catch (err) {
            setAiError(err.message || "Failed to generate summary");
        } finally {
            setAiLoading(false);
        }
    }

    return (
        <div style={styles.card}>
            <h3 style={styles.title}>Candidate summary</h3>

            <div style={styles.topMeta}>
                <div style={styles.metaBox}>
                    <span style={styles.metaLabel}>Name</span>
                    <strong>{summary.meta?.candidate_name || "—"}</strong>
                </div>
                <div style={styles.metaBox}>
                    <span style={styles.metaLabel}>City</span>
                    <strong>{summary.meta?.city || "—"}</strong>
                </div>
                <div style={styles.metaBox}>
                    <span style={styles.metaLabel}>Total score</span>
                    <strong>{summary.total_score}</strong>
                </div>
            </div>

            <div
                style={{
                    ...styles.requiredBox,
                    ...requiredBoxStyle
                }}
            >
                <div style={styles.requiredHeader}>
                    <h4 style={styles.requiredTitle}>Required criteria status</h4>
                    <span style={styles.requiredBadge}>{requiredBadgeText}</span>
                </div>

                {!hasRequiredInfo ? (
                    <p style={styles.note}>
                        This run does not contain required-criteria evaluation yet. Save required criteria and run scoring again.
                    </p>
                ) : requiredTotal === 0 ? (
                    <p style={styles.note}>
                        Required criteria are not configured for this vacancy. Mark at least one criterion as required, save criteria, and run scoring again.
                    </p>
                ) : (
                    <div style={styles.requiredGrid}>
                        <div style={styles.requiredItem}>
                            <span style={styles.requiredLabel}>Passed required criteria</span>
                            <strong>{requiredPassed} / {requiredTotal}</strong>
                        </div>

                        <div style={styles.requiredItem}>
                            <span style={styles.requiredLabel}>Penalty</span>
                            <strong>{requiredPenalty}</strong>
                        </div>

                        <div style={{ ...styles.requiredItem, gridColumn: "1 / -1" }}>
                            <span style={styles.requiredLabel}>Failed required criteria</span>
                            <strong>{formatFailedCriteria(failedRequiredCriteria)}</strong>
                        </div>
                    </div>
                )}
            </div>

            <div style={styles.columns}>
                <div style={styles.block}>
                    <h4>Strengths</h4>
                    {summary.strengths?.length ? (
                        <ul style={styles.list}>
                            {summary.strengths.map((item, index) => (
                                <li key={`${item.calc_type}-${index}`}>
                                    <strong>{item.name}</strong><br />
                                    <span>{item.explanation}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>—</p>
                    )}
                </div>

                <div style={styles.block}>
                    <h4>Weaknesses</h4>
                    {summary.weaknesses?.length ? (
                        <ul style={styles.list}>
                            {summary.weaknesses.map((item, index) => (
                                <li key={`${item.calc_type}-${index}`}>
                                    <strong>{item.name}</strong><br />
                                    <span>{item.explanation}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>—</p>
                    )}
                </div>
            </div>

            <div style={styles.aiBlock}>
                <div style={styles.aiHeader}>
                    <h4 style={styles.aiTitle}>AI Summary</h4>
                    <button
                        style={aiLoading ? styles.aiBtnLoading : styles.aiBtn}
                        onClick={handleGenerateAi}
                        disabled={aiLoading}
                    >
                        {aiLoading ? "Generating..." : aiSummary ? "Regenerate" : "Generate AI Summary"}
                    </button>
                </div>
                {aiError && <p style={styles.aiError}>{aiError}</p>}
                {aiSummary && <p style={styles.aiText}>{aiSummary}</p>}
                {!aiSummary && !aiError && !aiLoading && (
                    <p style={styles.aiHint}>Click the button to get an AI-generated explanation of this candidate's fit.</p>
                )}
            </div>
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
    topMeta: {
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "12px",
        marginBottom: "18px"
    },
    metaBox: {
        background: "#f7f9fc",
        borderRadius: "10px",
        padding: "12px",
        minWidth: 0
    },
    metaLabel: {
        display: "block",
        fontSize: "12px",
        color: "#666",
        marginBottom: "4px"
    },
    requiredBox: {
        borderRadius: "14px",
        padding: "16px",
        border: "1px solid",
        marginBottom: "18px"
    },
    requiredOk: {
        background: "#f0fdf4",
        borderColor: "#86efac"
    },
    requiredFail: {
        background: "#fff7ed",
        borderColor: "#fdba74"
    },
    requiredMuted: {
        background: "#f8fafc",
        borderColor: "#cbd5e1"
    },
    requiredHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "12px",
        marginBottom: "12px",
        flexWrap: "wrap"
    },
    requiredTitle: {
        margin: 0
    },
    requiredBadge: {
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "999px",
        padding: "6px 10px",
        fontSize: "12px",
        fontWeight: 700,
        whiteSpace: "nowrap"
    },
    note: {
        margin: 0,
        color: "#475569",
        lineHeight: 1.5
    },
    requiredGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
        gap: "16px"
    },
    requiredItem: {
        display: "grid",
        gap: "6px",
        minWidth: 0
    },
    requiredLabel: {
        fontSize: "12px",
        color: "#64748b"
    },
    columns: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px"
    },
    block: {
        background: "#fafafa",
        borderRadius: "10px",
        padding: "12px"
    },
    list: {
        margin: 0,
        paddingLeft: "18px",
        display: "grid",
        gap: "10px"
    },
    aiBlock: {
        marginTop: "16px",
        background: "#f0f7ff",
        border: "1px solid #bfdbfe",
        borderRadius: "12px",
        padding: "16px"
    },
    aiHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "10px"
    },
    aiTitle: {
        margin: 0,
        fontSize: "15px"
    },
    aiBtn: {
        background: "#2563eb",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        padding: "8px 16px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 600
    },
    aiBtnLoading: {
        background: "#93c5fd",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        padding: "8px 16px",
        cursor: "not-allowed",
        fontSize: "13px",
        fontWeight: 600
    },
    aiText: {
        margin: 0,
        lineHeight: 1.7,
        color: "#1e3a5f"
    },
    aiHint: {
        margin: 0,
        color: "#64748b",
        fontSize: "13px"
    },
    aiError: {
        margin: 0,
        color: "#dc2626",
        fontSize: "13px"
    }
};