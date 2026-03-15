import { formatDate } from "../../utils/formatters.js";

export default function RunsHistory({ runs, selectedRunId, onSelectRun }) {
    if (!runs?.length) {
        return <p>No scoring runs found.</p>;
    }

    return (
        <div style={styles.wrapper}>
            <table style={styles.table}>
                <thead>
                <tr>
                    <th style={styles.th}>Run ID</th>
                    <th style={styles.th}>Count</th>
                    <th style={styles.th}>Started</th>
                    <th style={styles.th}>Finished</th>
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
                            <td style={styles.td}>{run.run_id}</td>
                            <td style={styles.td}>{run.cnt}</td>
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
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "10px",
        overflowX: "auto"
    },
    table: {
        width: "100%",
        borderCollapse: "collapse"
    },
    th: {
        textAlign: "left",
        padding: "12px",
        borderBottom: "1px solid #ddd",
        background: "#f4f4f4"
    },
    td: {
        padding: "12px",
        borderBottom: "1px solid #eee",
        fontSize: "14px"
    },
    row: {
        cursor: "pointer"
    },
    selectedRow: {
        background: "#eef4ff"
    }
};