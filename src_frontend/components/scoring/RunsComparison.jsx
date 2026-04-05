import { useEffect, useState } from "react";

const STATUS_CONFIG = {
    up:      { icon: "↑", color: "#16a34a", bg: "#f0fdf4", label: "Moved up" },
    down:    { icon: "↓", color: "#dc2626", bg: "#fef2f2", label: "Moved down" },
    same:    { icon: "→", color: "#64748b", bg: "#f8fafc", label: "Same position" },
    new:     { icon: "★", color: "#2563eb", bg: "#eff6ff", label: "New in top" },
    removed: { icon: "✕", color: "#9ca3af", bg: "#f9fafb", label: "Left top" },
};

export default function RunsComparison({ runs = [], vacancyId }) {
    const [run1, setRun1] = useState("");
    const [run2, setRun2] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Pre-select the two most recent runs whenever runs list changes
    useEffect(() => {
        if (runs.length >= 2) {
            setRun1(String(runs[1].run_id));
            setRun2(String(runs[0].run_id));
        } else if (runs.length === 1) {
            setRun1(String(runs[0].run_id));
            setRun2("");
        }
        setData(null);
    }, [runs]);

    async function handleCompare() {
        if (!run1 || !run2 || run1 === run2) {
            setError("Please select two different runs.");
            return;
        }
        setError("");
        setLoading(true);
        try {
            const res = await fetch(`/vacancies/${vacancyId}/runs/compare?run1=${run1}&run2=${run2}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Request failed");
            setData(json.comparison || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    const formatRunLabel = (r) => {
        const raw = r.started_at || r.finished_at || r.created_at;
        const date = raw
            ? new Date(raw).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
            : String(r.run_id).slice(0, 8);
        return `${String(r.run_id).slice(0, 8)}… · ${date} (${r.cnt ?? "?"} evals)`;
    };

    if (runs.length < 2) return null;

    return (
        <div style={styles.wrapper}>
            <h2 style={styles.heading}>Run comparison</h2>

            <div style={styles.controls}>
                <div style={styles.selectGroup}>
                    <label style={styles.label}>Baseline run</label>
                    <select style={styles.select} value={run1} onChange={e => { setRun1(e.target.value); setData(null); }}>
                        <option value="">— select —</option>
                        {runs.map(r => <option key={r.run_id} value={String(r.run_id)}>{formatRunLabel(r)}</option>)}
                    </select>
                </div>
                <div style={styles.arrow}>→</div>
                <div style={styles.selectGroup}>
                    <label style={styles.label}>New run</label>
                    <select style={styles.select} value={run2} onChange={e => { setRun2(e.target.value); setData(null); }}>
                        <option value="">— select —</option>
                        {runs.map(r => <option key={r.run_id} value={String(r.run_id)}>{formatRunLabel(r)}</option>)}
                    </select>
                </div>
                <button style={styles.btn} onClick={handleCompare} disabled={loading}>
                    {loading ? "Loading…" : "Compare"}
                </button>
            </div>

            {error && <p style={styles.error}>{error}</p>}

            {data && (
                <>
                    <div style={styles.legend}>
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                            <span key={key} style={{ ...styles.legendItem, color: cfg.color }}>
                                <span style={styles.legendIcon}>{cfg.icon}</span> {cfg.label}
                            </span>
                        ))}
                    </div>

                    <div style={styles.tableWrap}>
                        <table style={styles.table}>
                            <thead>
                                <tr style={styles.thead}>
                                    <th style={styles.th}>Change</th>
                                    <th style={styles.th}>Candidate</th>
                                    <th style={{ ...styles.th, textAlign: "center" }}>Rank (old → new)</th>
                                    <th style={{ ...styles.th, textAlign: "center" }}>Score (old → new)</th>
                                    <th style={{ ...styles.th, textAlign: "center" }}>Δ Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, i) => {
                                    const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.same;
                                    const removed = row.status === "removed";
                                    return (
                                        <tr key={i} style={{ background: cfg.bg, opacity: removed ? 0.6 : 1 }}>
                                            <td style={{ ...styles.td, textAlign: "center" }}>
                                                <span style={{ ...styles.statusIcon, color: cfg.color }} title={cfg.label}>
                                                    {cfg.icon}
                                                </span>
                                            </td>
                                            <td style={styles.td}>
                                                <span style={{ textDecoration: removed ? "line-through" : "none", fontWeight: 500 }}>
                                                    {row.candidate_name || "—"}
                                                </span>
                                                {row.city ? <span style={styles.city}> · {row.city}</span> : null}
                                            </td>
                                            <td style={{ ...styles.td, textAlign: "center" }}>
                                                {removed
                                                    ? <span style={{ color: "#9ca3af" }}>{row.rank1} → —</span>
                                                    : row.status === "new"
                                                        ? <span style={{ color: "#2563eb" }}>— → {row.rank2}</span>
                                                        : <span>
                                                            <span style={{ color: "#64748b" }}>{row.rank1}</span>
                                                            {" → "}
                                                            <strong style={{ color: cfg.color }}>{row.rank2}</strong>
                                                          </span>
                                                }
                                            </td>
                                            <td style={{ ...styles.td, textAlign: "center" }}>
                                                {removed
                                                    ? <span style={{ color: "#9ca3af" }}>{Number(row.score1).toFixed(2)} → —</span>
                                                    : row.status === "new"
                                                        ? <span style={{ color: "#2563eb" }}>— → {Number(row.score2).toFixed(2)}</span>
                                                        : <span style={{ color: "#374151" }}>
                                                            {Number(row.score1).toFixed(2)} → {Number(row.score2).toFixed(2)}
                                                          </span>
                                                }
                                            </td>
                                            <td style={{ ...styles.td, textAlign: "center" }}>
                                                {row.score_change != null && !removed && row.status !== "new"
                                                    ? <span style={{
                                                        fontWeight: 700,
                                                        color: row.score_change > 0 ? "#16a34a" : row.score_change < 0 ? "#dc2626" : "#64748b"
                                                      }}>
                                                        {row.score_change > 0 ? "+" : ""}{Number(row.score_change).toFixed(2)}
                                                      </span>
                                                    : <span style={{ color: "#d1d5db" }}>—</span>
                                                }
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

const styles = {
    wrapper: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "20px", display: "grid", gap: "16px" },
    heading: { margin: 0, fontSize: "18px" },
    controls: { display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" },
    selectGroup: { display: "grid", gap: "4px", flex: "1 1 200px" },
    label: { fontSize: "12px", color: "#64748b", fontWeight: 600 },
    select: { padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "13px", background: "#f9fafb" },
    arrow: { fontSize: "20px", color: "#94a3b8", paddingBottom: "4px" },
    btn: { padding: "8px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px", flexShrink: 0 },
    error: { color: "#dc2626", margin: 0, fontSize: "13px" },
    legend: { display: "flex", gap: "16px", flexWrap: "wrap" },
    legendItem: { fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" },
    legendIcon: { fontSize: "14px", fontWeight: 700 },
    tableWrap: { overflowX: "auto" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
    thead: { background: "#f8fafc" },
    th: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" },
    td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
    statusIcon: { fontSize: "16px", fontWeight: 700 },
    city: { color: "#94a3b8", fontSize: "12px" },
};
