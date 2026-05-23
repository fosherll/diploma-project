// Словник назв полів конфігурації критеріїв (англ → укр)
const CONFIG_LABELS = {
    "Expected city":          "Очікуване місто",
    "Base city":              "Базове місто",
    "Allowed cities / region":"Дозволені міста / регіон",
    "Allowed region":         "Дозволений регіон",
    "Minimum salary":         "Мінімальна зарплата",
    "Maximum salary":         "Максимальна зарплата",
    "Minimum years":          "Мінімум років досвіду",
    "Employment types":       "Типи зайнятості",
    "Expected values":        "Допустимі значення",
    "Required languages":     "Обов'язкові мови",
    "Title keywords":         "Ключові слова посади",
    "Role keywords":          "Ключові слова ролі",
    "Keywords":               "Ключові слова",
    "Education levels":       "Рівні освіти",
    "Required levels":        "Обов'язкові рівні",
    "Fresh days":             "Свіжі дні",
    "Acceptable days":        "Прийнятні дні",
    "Stale days":             "Застарілі дні",
    "Minimum markdown length":"Мінімальна довжина CV",
    "Minimum CV length":      "Мінімальна довжина CV",
    "Field":                  "Поле",
    "Accepted values":        "Прийнятні значення",
    "Minimum confidence":     "Мінімальна впевненість",
};

function renderConfig(item) {
    const config = item?.config || {};
    switch (item.calc_type) {
        case "city_match":          return [{ label: "Очікуване місто", value: config.city || "—" }];
        case "region_match":        return [{ label: "Базове місто", value: config.city || "—" }, { label: "Дозволені міста / регіон", value: Array.isArray(config.aliases) ? config.aliases.join(", ") : "—" }];
        case "salary_match":        return [{ label: "Мінімальна зарплата", value: config.min_salary ?? "—" }, { label: "Максимальна зарплата", value: config.max_salary ?? "—" }];
        case "experience_match":    return [{ label: "Мінімум років досвіду", value: config.min_years ?? "—" }];
        case "employment_type_match": return [{ label: "Типи зайнятості", value: Array.isArray(config.expected_values) ? config.expected_values.join(", ") : "—" }];
        case "language_match":      return [{ label: "Обов'язкові мови", value: Array.isArray(config.required_languages) ? config.required_languages.join(", ") : "—" }];
        case "title_similarity_match": return [{ label: "Ключові слова посади", value: Array.isArray(config.title_keywords) ? config.title_keywords.join(", ") : "—" }];
        case "keyword_match":       return [{ label: "Ключові слова", value: Array.isArray(config.keywords) ? config.keywords.join(", ") : "—" }];
        case "education_match":     return [{ label: "Рівні освіти", value: Array.isArray(config.required_levels) ? config.required_levels.join(", ") : "—" }];
        case "recency_match":       return [{ label: "Свіжі дні", value: config.fresh_days ?? "—" }, { label: "Прийнятні дні", value: config.acceptable_days ?? "—" }, { label: "Застарілі дні", value: config.stale_days ?? "—" }];
        case "completeness_match":  return [{ label: "Мінімальна довжина CV", value: config.min_markdown_length ?? "—" }];
        case "bool_match":          return [{ label: "Поле", value: config.field || "—" }, { label: "Прийнятні значення", value: Array.isArray(config.truthy) ? config.truthy.join(", ") : "—" }];
        case "skill_mapping_match": return [{ label: "Мінімальна впевненість", value: config.min_confidence ?? "—" }];
        default:
            return Object.entries(config).map(([key, value]) => ({
                label: CONFIG_LABELS[key] || key,
                value: Array.isArray(value) ? value.join(", ") : String(value)
            }));
    }
}

export default function CriteriaList({ criteria }) {
    if (!criteria?.length) {
        return <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>Критеріїв не знайдено.</p>;
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
                            <MetaBox label="Вага" value={item.weight} />
                            <MetaBox label="Увімкнено" value={item.is_enabled ? "Так" : "Ні"} />
                            <MetaBox label="Обов'язкове" value={item?.config?.required ? "Так" : "Ні"} />
                        </div>

                        {configRows.length > 0 && (
                            <div style={styles.configBlock}>
                                {configRows.map((row, index) => (
                                    <div key={index} style={styles.configRow}>
                                        <span style={styles.configLabel}>{row.label}</span>
                                        <span style={styles.configValue}>{row.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function MetaBox({ label, value }) {
    return (
        <div style={styles.metaBox}>
            <span style={styles.metaLabel}>{label}</span>
            <strong style={{ fontSize: "15px" }}>{value}</strong>
        </div>
    );
}

const styles = {
    grid: { display: "grid", gap: "12px" },
    card: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px",
        padding: "16px", display: "grid", gap: "12px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
    },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" },
    title:  { margin: 0, fontSize: "15px", fontWeight: 600, color: "#0f172a" },
    badge: {
        background: "#eff6ff", color: "#1d4ed8", borderRadius: "999px",
        padding: "4px 10px", fontSize: "11px", fontWeight: 700, flexShrink: 0
    },
    metaRow: { display: "flex", gap: "10px", flexWrap: "wrap" },
    metaBox: {
        background: "#f8fafc", border: "1px solid #f1f5f9",
        borderRadius: "10px", padding: "8px 14px",
        display: "grid", gap: "3px", minWidth: "100px"
    },
    metaLabel: { fontSize: "11px", color: "#64748b", fontWeight: 600 },
    configBlock: { display: "grid", gap: "6px" },
    configRow: {
        display: "grid", gridTemplateColumns: "220px 1fr",
        gap: "12px", padding: "6px 0",
        borderBottom: "1px solid #f1f5f9"
    },
    configLabel: { color: "#64748b", fontSize: "13px" },
    configValue: { fontSize: "13px", color: "#0f172a", wordBreak: "break-word" }
};
