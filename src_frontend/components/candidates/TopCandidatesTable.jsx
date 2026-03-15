export default function TopCandidatesTable({ items, selectedResumeId, onSelect }) {
    if (!items?.length) {
        return <p>No candidates found.</p>;
    }

    return (
        <div style={styles.wrapper}>
            <table style={styles.table}>
                <thead>
                <tr>
                    <th style={styles.th}>Candidate</th>
                    <th style={styles.th}>City</th>
                    <th style={styles.th}>Score</th>
                    <th style={styles.th}>Resume ID</th>
                </tr>
                </thead>
                <tbody>
                {items.map((item) => {
                    const selected = String(item.resume_id) === String(selectedResumeId);

                    return (
                        <tr
                            key={item.resume_id}
                            onClick={() => onSelect?.(item)}
                            style={{
                                ...styles.row,
                                ...(selected ? styles.selectedRow : {})
                            }}
                        >
                            <td style={styles.td}>{item.candidate_name}</td>
                            <td style={styles.td}>{item.city || "—"}</td>
                            <td style={styles.td}>{item.total_score}</td>
                            <td style={styles.td}>{item.resume_id}</td>
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
        borderRadius: "12px",
        overflowX: "auto"
    },
    table: {
        width: "100%",
        borderCollapse: "collapse"
    },
    th: {
        textAlign: "left",
        padding: "14px",
        borderBottom: "1px solid #ddd",
        background: "#f7f9fc",
        fontSize: "14px"
    },
    td: {
        padding: "14px",
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