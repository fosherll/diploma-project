function renderConfig(item) {
    const config = item?.config || {};

    switch (item.calc_type) {
        case "city_match":
            return [
                { label: "Expected city", value: config.city || "—" }
            ];

        case "region_match":
            return [
                { label: "Base city", value: config.city || "—" },
                {
                    label: "Allowed cities / region",
                    value: Array.isArray(config.aliases) ? config.aliases.join(", ") : "—"
                }
            ];

        case "salary_match":
            return [
                { label: "Minimum salary", value: config.min_salary ?? "—" },
                { label: "Maximum salary", value: config.max_salary ?? "—" }
            ];

        case "experience_match":
            return [
                { label: "Minimum years", value: config.min_years ?? "—" }
            ];

        case "employment_type_match":
            return [
                {
                    label: "Expected values",
                    value: Array.isArray(config.expected_values) ? config.expected_values.join(", ") : "—"
                }
            ];

        case "language_match":
            return [
                {
                    label: "Required languages",
                    value: Array.isArray(config.required_languages) ? config.required_languages.join(", ") : "—"
                }
            ];

        case "title_similarity_match":
            return [
                {
                    label: "Title keywords",
                    value: Array.isArray(config.title_keywords) ? config.title_keywords.join(", ") : "—"
                }
            ];

        case "keyword_match":
            return [
                {
                    label: "Keywords",
                    value: Array.isArray(config.keywords) ? config.keywords.join(", ") : "—"
                }
            ];

        case "education_match":
            return [
                {
                    label: "Required levels",
                    value: Array.isArray(config.required_levels) ? config.required_levels.join(", ") : "—"
                }
            ];

        case "recency_match":
            return [
                { label: "Fresh days", value: config.fresh_days ?? "—" },
                { label: "Acceptable days", value: config.acceptable_days ?? "—" },
                { label: "Stale days", value: config.stale_days ?? "—" }
            ];

        case "completeness_match":
            return [
                { label: "Minimum markdown length", value: config.min_markdown_length ?? "—" }
            ];

        case "bool_match":
            return [
                { label: "Field", value: config.field || "—" },
                {
                    label: "Accepted values",
                    value: Array.isArray(config.truthy) ? config.truthy.join(", ") : "—"
                }
            ];

        case "skill_mapping_match":
            return [
                { label: "Minimum confidence", value: config.min_confidence ?? "—" }
            ];

        default:
            return Object.entries(config).map(([key, value]) => ({
                label: key,
                value: Array.isArray(value) ? value.join(", ") : String(value)
            }));
    }
}

export default function CriteriaList({ criteria }) {
    if (!criteria?.length) {
        return <p>No criteria found.</p>;
    }

    return (
        <div style={styles.grid}>
            {criteria.map((item) => {
                const configRows = renderConfig(item);

                return (
                    <div key={item.id} style={styles.card}>
                        <div style={styles.header}>
                            <h4 style={styles.title}>{item.name}</h4>
                            <span style={styles.badge}>{item.calc_type}</span>
                        </div>

                        <div style={styles.metaRow}>
                            <div style={styles.metaBox}>
                                <span style={styles.metaLabel}>Weight</span>
                                <strong>{item.weight}</strong>
                            </div>
                            <div style={styles.metaBox}>
                                <span style={styles.metaLabel}>Enabled</span>
                                <strong>{item.is_enabled ? "Yes" : "No"}</strong>
                            </div>
                            <div style={styles.metaBox}>
                                <span style={styles.metaLabel}>Required</span>
                                <strong>{item?.config?.required ? "Yes" : "No"}</strong>
                            </div>
                        </div>

                        <div style={styles.configBlock}>
                            {configRows.map((row, index) => (
                                <div key={index} style={styles.configRow}>
                                    <span style={styles.configLabel}>{row.label}</span>
                                    <span style={styles.configValue}>{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

const styles = {
    grid: {
        display: "grid",
        gap: "14px"
    },
    card: {
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "12px",
        padding: "16px"
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        marginBottom: "12px"
    },
    title: {
        margin: 0
    },
    badge: {
        background: "#eef4ff",
        color: "#234",
        borderRadius: "999px",
        padding: "6px 10px",
        fontSize: "12px"
    },
    metaRow: {
        display: "flex",
        gap: "12px",
        marginBottom: "12px"
    },
    metaBox: {
        background: "#f7f7f7",
        borderRadius: "8px",
        padding: "10px 12px",
        minWidth: "120px",
        display: "grid",
        gap: "4px"
    },
    metaLabel: {
        fontSize: "12px",
        color: "#666"
    },
    configBlock: {
        display: "grid",
        gap: "8px"
    },
    configRow: {
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        gap: "12px",
        padding: "8px 0",
        borderBottom: "1px solid #f0f0f0"
    },
    configLabel: {
        color: "#666",
        fontSize: "14px"
    },
    configValue: {
        fontSize: "14px"
    }
};