import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const CLUSTER_COLORS = [
    { bg: "#eff6ff", border: "#bfdbfe", badge: "#2563eb", text: "#1e3a5f" },
    { bg: "#f0fdf4", border: "#bbf7d0", badge: "#16a34a", text: "#14532d" },
    { bg: "#fdf4ff", border: "#e9d5ff", badge: "#9333ea", text: "#581c87" },
    { bg: "#fff7ed", border: "#fed7aa", badge: "#ea580c", text: "#7c2d12" },
    { bg: "#fafafa", border: "#e5e7eb", badge: "#6b7280", text: "#111827" },
];

export default function CandidateClusters({ vacancyId, runId, onSelectCandidate }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [k, setK] = useState(3);
    const [expanded, setExpanded] = useState({});

    async function load(kVal) {
        if (!vacancyId) return;
        setLoading(true);
        try {
            const query = new URLSearchParams({ k: kVal, limit: 50 });
            if (runId) query.set("run_id", runId);
            const json = await apiFetch(`/vacancies/${vacancyId}/clusters?${query}`);
            setData(json);
            // Expand all clusters by default
            const exp = {};
            (json.clusters || []).forEach((_, i) => { exp[i] = true; });
            setExpanded(exp);
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(k); }, [vacancyId, runId]);

    function handleKChange(val) {
        setK(val);
        load(val);
    }

    if (!data && !loading) return null;

    return (
        <div style={styles.wrapper}>
            <div style={styles.header}>
                <h3 style={styles.title}>Candidate clusters</h3>
                <div style={styles.controls}>
                    <label style={styles.label}>Number of clusters:</label>
                    {[2, 3, 4, 5].map(n => (
                        <button
                            key={n}
                            style={k === n ? styles.kBtnActive : styles.kBtn}
                            onClick={() => handleKChange(n)}
                            disabled={loading}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </div>

            {loading && <p style={styles.hint}>Clustering candidates...</p>}

            {!loading && data?.clusters?.length === 0 && (
                <p style={styles.hint}>No candidates to cluster. Run scoring first.</p>
            )}

            {!loading && data?.clusters?.length > 0 && (
                <div style={styles.clusters}>
                    {data.clusters.map((cluster, idx) => {
                        const color = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
                        const isOpen = expanded[idx];
                        return (
                            <div key={idx} style={{ ...styles.clusterCard, background: color.bg, borderColor: color.border }}>
                                <div style={styles.clusterHeader} onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}>
                                    <div style={styles.clusterLeft}>
                                        <span style={{ ...styles.clusterBadge, background: color.badge }}>
                                            {cluster.label}
                                        </span>
                                        <span style={styles.clusterCount}>{cluster.members.length} candidates</span>
                                        <span style={styles.clusterScore}>avg score: {cluster.avgScore}</span>
                                    </div>
                                    <div style={styles.clusterRight}>
                                        {cluster.topSkills.length > 0 && (
                                            <div style={styles.skillTags}>
                                                {cluster.topSkills.map(s => (
                                                    <span key={s} style={{ ...styles.skillTag, color: color.badge, borderColor: color.border }}>
                                                        {s}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <span style={styles.toggle}>{isOpen ? "▲" : "▼"}</span>
                                    </div>
                                </div>

                                {isOpen && (
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>Name</th>
                                                <th style={styles.th}>City</th>
                                                <th style={styles.th}>Score</th>
                                                <th style={styles.th}>Skills</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cluster.members.map(m => (
                                                <tr
                                                    key={m.resume_id}
                                                    style={styles.row}
                                                    onClick={() => onSelectCandidate?.({ resume_id: m.resume_id, candidate_name: m.candidate_name, city: m.city, total_score: m.total_score })}
                                                >
                                                    <td style={styles.td}>{m.candidate_name}</td>
                                                    <td style={styles.td}>{m.city}</td>
                                                    <td style={styles.td}>{m.total_score}</td>
                                                    <td style={styles.td}>
                                                        {m.topSkills.length > 0
                                                            ? m.topSkills.join(", ")
                                                            : <span style={{ color: "#94a3b8" }}>—</span>
                                                        }
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const styles = {
    wrapper: {
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "20px",
        display: "grid",
        gap: "16px"
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px"
    },
    title: { margin: 0 },
    controls: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
    },
    label: { fontSize: "13px", color: "#64748b" },
    kBtn: {
        width: "36px", height: "36px",
        borderRadius: "8px",
        border: "1px solid #cbd5e1",
        background: "#fff",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: "14px"
    },
    kBtnActive: {
        width: "36px", height: "36px",
        borderRadius: "8px",
        border: "1px solid #2563eb",
        background: "#2563eb",
        color: "#fff",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: "14px"
    },
    clusters: { display: "grid", gap: "12px" },
    clusterCard: {
        border: "1px solid",
        borderRadius: "14px",
        overflow: "hidden"
    },
    clusterHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 16px",
        cursor: "pointer",
        flexWrap: "wrap",
        gap: "10px"
    },
    clusterLeft: {
        display: "flex",
        alignItems: "center",
        gap: "12px"
    },
    clusterRight: {
        display: "flex",
        alignItems: "center",
        gap: "12px"
    },
    clusterBadge: {
        color: "#fff",
        borderRadius: "8px",
        padding: "4px 12px",
        fontSize: "13px",
        fontWeight: 700
    },
    clusterCount: { fontSize: "14px", color: "#475569" },
    clusterScore: { fontSize: "13px", color: "#64748b" },
    skillTags: { display: "flex", gap: "6px", flexWrap: "wrap" },
    skillTag: {
        border: "1px solid",
        borderRadius: "999px",
        padding: "2px 10px",
        fontSize: "12px",
        fontWeight: 500,
        background: "#fff"
    },
    toggle: { fontSize: "12px", color: "#94a3b8" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: {
        textAlign: "left",
        padding: "10px 16px",
        fontSize: "13px",
        color: "#64748b",
        borderTop: "1px solid #e5e7eb"
    },
    td: {
        padding: "10px 16px",
        fontSize: "14px",
        borderTop: "1px solid #e5e7eb"
    },
    row: { cursor: "pointer" },
    hint: { color: "#64748b", fontSize: "14px", margin: 0 }
};
