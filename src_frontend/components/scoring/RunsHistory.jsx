import { formatDate } from "../../utils/formatters.js";

export default function RunsHistory({ runs, selectedRunId, onSelectRun }) {
    if (!runs?.length) {
        return (
            <div style={styles.empty}>
                Запусків скорингу ще немає. Натисніть «Запустити скоринг» вище.
            </div>
        );
    }

    return (
        <div style={styles.wrapper}>
            <table style={styles.table}>
                <thead>
                    <tr style={styles.headRow}>
                        <th style={styles.th}>Run ID</th>
                        <th style={styles.th}>Кандидатів</th>
                        <th style={styles.th}>Розпочато</th>
                        <th style={styles.th}>Завершено</th>
                    </tr>
                </thead>
                <tbody>
                    {runs.map((run) => {
                        const selected = String(run.run_id) === String(selectedRunId);
                        return (
                            <tr
                                key={run.run_id}
                                onClick={() => onSelectRun?.(run)}
                                style={{
                                    ...styles.row,
                                    ...(selected ? styles.selectedRow : {})
                                }}
                            >
                                <td style={styles.td}>
                                    <span style={styles.runId}>{String(run.run_id).slice(0, 8)}…</span>
                                </td>
                                <td style={styles.td}>
                                    <span style={styles.count}>{run.cnt}</span>
                                </td>
                                <td style={styles.td}>{formatDate(run.started_at)}</td>
                                <td style={styles.td}>{formatDate(run.finished_at)}</td>
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
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px",
        overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
    table:   { width: "100%", borderCollapse: "collapse" },
    headRow: { background: "#f8fafc" },
    th: {
        textAlign: "left", padding: "12px 16px",
        borderBottom: "1px solid #e2e8f0",
        fontSize: "12px", fontWeight: 700, color: "#64748b",
        textTransform: "uppercase", letterSpacing: "0.04em"
    },
    td: {
        padding: "12px 16px", borderBottom: "1px solid #f1f5f9",
        fontSize: "13px", color: "#374151"
    },
    row: { cursor: "pointer", transition: "background 0.1s" },
    selectedRow: { background: "#eff6ff" },
    runId: { fontFamily: "monospace", fontSize: "12px", color: "#64748b" },
    count: { fontWeight: 600, color: "#0f172a" },
    empty: {
        padding: "20px", color: "#94a3b8", fontSize: "14px", textAlign: "center"
    }
};
