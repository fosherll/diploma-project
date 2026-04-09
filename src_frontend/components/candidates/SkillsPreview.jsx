export default function SkillsPreview({ preview }) {
    if (!preview) {
        return <p style={{ color: "#64748b", fontSize: "14px" }}>Виберіть кандидата для перегляду навичок.</p>;
    }
    if (preview.available === false) {
        return null;
    }

    const matched = preview.matched ?? [];
    const missing = preview.missing ?? [];

    return (
        <div style={styles.card}>
            <h3 style={styles.title}>Порівняння навичок (ESCO)</h3>
            <div style={styles.columns}>
                <div style={styles.block}>
                    <h4 style={styles.blockTitle}>
                        Збіги ({matched.length})
                    </h4>
                    {matched.length === 0
                        ? <p style={styles.empty}>Збігів не знайдено</p>
                        : (
                            <ul style={styles.list}>
                                {matched.map(s => (
                                    <li key={s.esco_label} style={styles.matchedItem}>
                                        <span style={styles.skillLabel}>{s.esco_label}</span>
                                        <span style={styles.conf}>
                                            {Math.round(s.cv_confidence * 100)}%
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )
                    }
                </div>
                <div style={styles.block}>
                    <h4 style={{ ...styles.blockTitle, color: "#b91c1c" }}>
                        Відсутні у кандидата ({missing.length})
                    </h4>
                    {missing.length === 0
                        ? <p style={styles.empty}>Всі навички є</p>
                        : (
                            <ul style={styles.list}>
                                {missing.map(s => (
                                    <li key={s.esco_label} style={styles.missingItem}>
                                        <span style={styles.skillLabel}>{s.esco_label}</span>
                                        <span style={styles.conf}>
                                            вак: {Math.round(s.vacancy_confidence * 100)}%
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )
                    }
                </div>
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
        marginTop: 0,
        fontSize: "16px"
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
    blockTitle: {
        margin: "0 0 8px 0",
        fontSize: "14px",
        color: "#15803d"
    },
    list: {
        margin: 0,
        paddingLeft: 0,
        listStyle: "none",
        display: "grid",
        gap: "6px"
    },
    matchedItem: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: "6px",
        padding: "4px 8px"
    },
    missingItem: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#fff7f7",
        border: "1px solid #fecaca",
        borderRadius: "6px",
        padding: "4px 8px"
    },
    skillLabel: {
        fontSize: "13px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: "75%"
    },
    conf: {
        fontSize: "11px",
        color: "#64748b",
        flexShrink: 0
    },
    empty: {
        margin: 0,
        fontSize: "13px",
        color: "#94a3b8"
    }
};
