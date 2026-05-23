import { useEffect, useMemo, useState } from "react";
import { updateCriteria } from "../../api/criteriaApi.js";
import { apiFetch } from "../../api/client.js";

function cloneCriteria(items) {
    return (items || []).map((item) => ({
        ...item,
        weight: Number(item.weight ?? 1),
        is_enabled: Boolean(item.is_enabled),
        config: {
            ...(item.config || {}),
            required: Boolean(item?.config?.required)
        }
    }));
}

function applyPresetToItems(items, preset) {
    const next = cloneCriteria(items);

    const setByType = (calcType, patch) => {
        const item = next.find((x) => x.calc_type === calcType);
        if (!item) return;
        Object.assign(item, patch);
        item.config = {
            ...(item.config || {}),
            ...(patch.config || {})
        };
    };

    if (preset === "balanced") {
        next.forEach((item) => {
            item.is_enabled = true;
            item.config = { ...(item.config || {}), required: false };
        });

        setByType("city_match", { weight: 3.0, config: { required: true } });
        setByType("salary_match", { weight: 2.5, config: { required: true } });
        setByType("experience_match", { weight: 2.2, config: { required: true } });
        setByType("employment_type_match", { weight: 1.7 });
        setByType("language_match", { weight: 1.6 });
        setByType("title_similarity_match", { weight: 1.8 });
        setByType("keyword_match", { weight: 1.8 });
        setByType("education_match", { weight: 1.1 });
        setByType("recency_match", { weight: 0.8 });
        setByType("completeness_match", { weight: 0.8 });
        setByType("bool_match", { weight: 0.2 });
        setByType("region_match", { weight: 1.5 });
        setByType("skill_mapping_match", { weight: 2.0 });
    }

    if (preset === "strict") {
        next.forEach((item) => {
            item.is_enabled = true;
            item.config = { ...(item.config || {}), required: false };
        });

        setByType("city_match", { weight: 3.5, config: { required: true } });
        setByType("region_match", { weight: 1.2 });
        setByType("salary_match", { weight: 3.0, config: { required: true } });
        setByType("experience_match", { weight: 2.8, config: { required: true } });
        setByType("employment_type_match", { weight: 2.0, config: { required: true } });
        setByType("language_match", { weight: 2.0, config: { required: true } });
        setByType("title_similarity_match", { weight: 1.5 });
        setByType("keyword_match", { weight: 1.4 });
        setByType("recency_match", { weight: 0.4 });
        setByType("completeness_match", { weight: 0.5 });
    }

    if (preset === "skills_first") {
        next.forEach((item) => {
            item.is_enabled = true;
            item.config = { ...(item.config || {}), required: false };
        });

        setByType("city_match", { weight: 2.0, config: { required: true } });
        setByType("salary_match", { weight: 2.0 });
        setByType("experience_match", { weight: 2.0, config: { required: true } });
        setByType("title_similarity_match", { weight: 2.2 });
        setByType("keyword_match", { weight: 2.4 });
        setByType("skill_mapping_match", { weight: 3.2 });
        setByType("education_match", { weight: 1.2 });
        setByType("language_match", { weight: 1.7 });
        setByType("employment_type_match", { weight: 1.0 });
        setByType("recency_match", { weight: 0.3 });
        setByType("completeness_match", { weight: 0.7 });
    }

    if (preset === "call_center") {
        next.forEach((item) => {
            item.is_enabled = true;
            item.config = { ...(item.config || {}), required: false };
        });

        setByType("city_match", { weight: 2.5, config: { required: true } });
        setByType("region_match", { weight: 1.8 });
        setByType("salary_match", { weight: 2.2, config: { required: true } });
        setByType("experience_match", { weight: 1.8 });
        setByType("employment_type_match", { weight: 2.2, config: { required: true } });
        setByType("language_match", { weight: 2.3, config: { required: true } });
        setByType("title_similarity_match", { weight: 1.8 });
        setByType("keyword_match", { weight: 2.4 });
        setByType("education_match", { weight: 0.8 });
        setByType("bool_match", { weight: 0.1 });
        setByType("recency_match", { weight: 0.5 });
        setByType("completeness_match", { weight: 1.0 });
    }

    return next;
}

function formatValue(value) {
    if (Array.isArray(value)) {
        if (value.length === 0) return "—";
        if (value.length <= 5) return value.join(", ");
        return `${value.slice(0, 5).join(", ")} +${value.length - 5} ще`;
    }
    if (typeof value === "boolean") return value ? "Так" : "Ні";
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
}

function getConfigRows(item) {
    const config = item?.config || {};
    const rows = [];

    switch (item.calc_type) {
        case "city_match":
            rows.push({ label: "Очікуване місто", value: config.city });
            break;

        case "region_match":
            rows.push({ label: "Базове місто", value: config.city });
            rows.push({ label: "Дозволений регіон", value: config.aliases });
            break;

        case "salary_match":
            rows.push({ label: "Мінімальна зарплата", value: config.min_salary });
            rows.push({ label: "Максимальна зарплата", value: config.max_salary });
            break;

        case "experience_match":
            rows.push({ label: "Мінімум років досвіду", value: config.min_years });
            break;

        case "employment_type_match":
            rows.push({ label: "Типи зайнятості", value: config.expected_values });
            break;

        case "language_match":
            rows.push({ label: "Обов'язкові мови", value: config.required_languages });
            break;

        case "title_similarity_match":
            rows.push({ label: "Ключові слова ролі", value: config.title_keywords });
            break;

        case "keyword_match":
            rows.push({ label: "Ключові слова", value: config.keywords });
            break;

        case "education_match":
            rows.push({ label: "Рівні освіти", value: config.required_levels });
            break;

        case "recency_match":
            rows.push({ label: "Свіжі дні", value: config.fresh_days });
            rows.push({ label: "Прийнятні дні", value: config.acceptable_days });
            rows.push({ label: "Застарілі дні", value: config.stale_days });
            break;

        case "completeness_match":
            rows.push({ label: "Мінімальна довжина CV", value: config.min_markdown_length });
            break;

        case "bool_match":
            rows.push({ label: "Поле", value: config.field });
            rows.push({ label: "Прийнятні значення", value: config.truthy });
            break;

        case "skill_mapping_match":
            rows.push({ label: "Мінімальна впевненість", value: config.min_confidence });
            break;

        default:
            Object.entries(config || {}).forEach(([key, value]) => {
                if (key === "required") return;
                rows.push({ label: key, value });
            });
            break;
    }

    return rows.filter((row) => row.value !== undefined);
}

export default function CriteriaForm({ vacancyId, criteria, onSaved, onDraftChange }) {
    const [items, setItems] = useState(() => cloneCriteria(criteria));
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [preset, setPreset] = useState("balanced");
    const [autoLoading, setAutoLoading] = useState(false);

    useEffect(() => {
        setItems(cloneCriteria(criteria));
    }, [criteria]);

    useEffect(() => {
        onDraftChange?.(items);
    }, [items, onDraftChange]);

    const enabledCount  = useMemo(() => items.filter((item) => item.is_enabled).length, [items]);
    const requiredCount = useMemo(() => items.filter((item) => item?.config?.required).length, [items]);

    function updateItem(index, patch) {
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== index) return item;
                return {
                    ...item,
                    ...patch,
                    config: {
                        ...(item.config || {}),
                        ...(patch.config || {})
                    }
                };
            })
        );
    }

    function handlePresetApply() {
        setItems((prev) => applyPresetToItems(prev, preset));
        setMessage(`Шаблон «${preset}» застосовано. Збережіть критерії для збереження змін.`);
    }

    function handleReset() {
        setItems(cloneCriteria(criteria));
        setMessage("Зміни скинуто до останнього збереженого стану.");
    }

    async function handleAutoWeights() {
        setAutoLoading(true);
        setMessage("");
        try {
            const calcTypes = items.map(i => i.calc_type);
            const { weights } = await apiFetch(`/vacancies/${vacancyId}/criteria/auto-weights`, {
                method: "POST",
                body: JSON.stringify({ calcTypes })
            });
            setItems(prev => prev.map(item => {
                const w = weights[item.calc_type];
                return w !== undefined ? { ...item, weight: w } : item;
            }));
            setMessage("Ваги від AI застосовано. Перевірте і збережіть, якщо згодні.");
        } catch (err) {
            setMessage("Помилка авто-налаштування: " + (err.message || "невідома помилка"));
        } finally {
            setAutoLoading(false);
        }
    }

    async function handleSave() {
        try {
            setSaving(true);
            setMessage("");

            const payload = items.map((item) => ({
                name: item.name,
                weight: Number(item.weight ?? 1),
                calc_type: item.calc_type,
                config: {
                    ...(item.config || {}),
                    required: Boolean(item?.config?.required)
                },
                is_enabled: Boolean(item.is_enabled)
            }));

            const result = await updateCriteria(vacancyId, payload);
            setMessage(`Критерії збережено. Всього: ${result.count}.`);
            await onSaved?.();
        } catch (error) {
            setMessage(error.message || "Помилка збереження критеріїв.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={styles.wrapper}>
            <div style={styles.headerCard}>
                <div style={styles.stats}>
                    <div style={styles.statBox}>
                        <span style={styles.statLabel}>Всього критеріїв</span>
                        <strong>{items.length}</strong>
                    </div>
                    <div style={styles.statBox}>
                        <span style={styles.statLabel}>Увімкнено</span>
                        <strong>{enabledCount}</strong>
                    </div>
                    <div style={styles.statBox}>
                        <span style={styles.statLabel}>Обов'язкових</span>
                        <strong>{requiredCount}</strong>
                    </div>
                </div>

                <div style={styles.toolbar}>
                    <div style={styles.toolbarGroup}>
                        <label style={styles.label}>Шаблон</label>
                        <select
                            value={preset}
                            onChange={(e) => setPreset(e.target.value)}
                            style={styles.select}
                        >
                            <option value="balanced">Збалансований</option>
                            <option value="strict">Суворий</option>
                            <option value="skills_first">Навички у пріоритеті</option>
                            <option value="call_center">Колл-центр</option>
                        </select>
                    </div>

                    <button type="button" style={styles.secondaryButton} onClick={handlePresetApply}>
                        Застосувати
                    </button>

                    <button type="button" style={styles.secondaryButton} onClick={handleReset}>
                        Скинути
                    </button>

                    <button type="button" style={styles.aiButton} onClick={handleAutoWeights} disabled={autoLoading}>
                        {autoLoading ? "Аналіз…" : "✦ AI ваги"}
                    </button>

                    <button type="button" style={styles.primaryButton} onClick={handleSave} disabled={saving}>
                        {saving ? "Збереження…" : "Зберегти"}
                    </button>
                </div>
            </div>

            <div style={styles.cards}>
                {items.map((item, index) => {
                    const configRows = getConfigRows(item);

                    return (
                        <div key={`${item.calc_type}-${index}`} style={styles.card}>
                            <div style={styles.cardHead}>
                                <div style={styles.titleWrap}>
                                    <h4 style={styles.title}>{item.name}</h4>
                                    <span style={styles.typeBadge}>{item.calc_type}</span>
                                </div>

                                <label style={styles.switchRow}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(item.is_enabled)}
                                        onChange={(e) =>
                                            updateItem(index, {
                                                is_enabled: e.target.checked,
                                                config: e.target.checked
                                                    ? {}
                                                    : {required: false}
                                            })
                                        }
                                    />
                                    <span>Увімкнено</span>
                                </label>
                            </div>

                            <div style={styles.mainControls}>
                                <div style={styles.field}>
                                    <label style={styles.label}>Вага</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        value={item.weight}
                                        onChange={(e) =>
                                            updateItem(index, {
                                                weight: Number(String(e.target.value).replace(",", ".") || 0)
                                            })
                                        }
                                        style={styles.input}
                                    />
                                </div>

                                <div style={styles.requiredBox}>
                                    <label style={styles.switchRow}>
                                        <input
                                            type="checkbox"
                                            checked={Boolean(item?.config?.required)}
                                            onChange={(e) =>
                                                updateItem(index, {
                                                    is_enabled: e.target.checked ? true : item.is_enabled,
                                                    config: {required: e.target.checked}
                                                })
                                            }
                                        />
                                        <span>Обов'язковий критерій</span>
                                    </label>
                                    <span style={styles.helpText}>
                                        Обов'язкові критерії враховуються у скорингу. Якщо позначити критерій обов'язковим, він увімкнеться автоматично.
                                    </span>
                                </div>
                            </div>

                            <div style={styles.configCard}>
                                <div style={styles.configTitle}>Налаштування критерію</div>

                                {configRows.length ? (
                                    <div style={styles.configGrid}>
                                        {configRows.map((row, rowIndex) => (
                                            <div key={rowIndex} style={styles.configRow}>
                                                <span style={styles.configLabel}>{row.label}</span>
                                                <span style={styles.configValue}>{formatValue(row.value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={styles.emptyConfig}>Додаткових налаштувань немає</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {message ? <div style={styles.message}>{message}</div> : null}
        </div>
    );
}

const styles = {
    wrapper: {
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "18px",
        padding: "20px",
        display: "grid",
        gap: "18px",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)"
    },
    headerCard: {
        display: "grid",
        gap: "16px",
        paddingBottom: "4px"
    },
    stats: {
        display: "flex",
        gap: "12px",
        flexWrap: "wrap"
    },
    statBox: {
        minWidth: "140px",
        background: "#f8fafc",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "12px 14px",
        display: "grid",
        gap: "4px"
    },
    statLabel: {
        fontSize: "12px",
        color: "#64748b"
    },
    toolbar: {
        display: "flex",
        gap: "10px",
        alignItems: "end",
        flexWrap: "wrap"
    },
    toolbarGroup: {
        display: "grid",
        gap: "6px",
        minWidth: "220px"
    },
    cards: {
        display: "grid",
        gap: "14px"
    },
    card: {
        background: "#fcfcfd",
        border: "1px solid #e5e7eb",
        borderRadius: "18px",
        padding: "18px",
        display: "grid",
        gap: "16px"
    },
    cardHead: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "start",
        gap: "16px",
        flexWrap: "wrap"
    },
    titleWrap: {
        display: "grid",
        gap: "8px"
    },
    title: {
        margin: 0,
        fontSize: "24px",
        lineHeight: 1.2
    },
    typeBadge: {
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
        background: "#eef2ff",
        color: "#3730a3",
        borderRadius: "999px",
        padding: "6px 10px",
        fontSize: "12px",
        fontWeight: 600
    },
    mainControls: {
        display: "grid",
        gridTemplateColumns: "220px minmax(280px, 1fr)",
        gap: "16px",
        alignItems: "start"
    },
    field: {
        display: "grid",
        gap: "6px"
    },
    label: {
        fontSize: "13px",
        color: "#475569"
    },
    input: {
        height: "44px",
        padding: "0 14px",
        borderRadius: "12px",
        border: "1px solid #cbd5e1",
        fontSize: "16px",
        background: "#fff",
        outline: "none"
    },
    select: {
        height: "44px",
        padding: "0 14px",
        borderRadius: "12px",
        border: "1px solid #cbd5e1",
        fontSize: "16px",
        background: "#fff",
        outline: "none"
    },
    requiredBox: {
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "12px 14px",
        display: "grid",
        gap: "8px",
        minHeight: "44px"
    },
    switchRow: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        fontSize: "15px"
    },
    helpText: {
        fontSize: "12px",
        color: "#64748b"
    },
    configCard: {
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "14px",
        display: "grid",
        gap: "12px"
    },
    configTitle: {
        fontSize: "14px",
        fontWeight: 700,
        color: "#0f172a"
    },
    configGrid: {
        display: "grid",
        gap: "10px"
    },
    configRow: {
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        gap: "14px",
        alignItems: "start",
        paddingBottom: "10px",
        borderBottom: "1px solid #e5e7eb"
    },
    configLabel: {
        color: "#64748b",
        fontSize: "14px"
    },
    configValue: {
        color: "#0f172a",
        fontSize: "14px",
        lineHeight: 1.5,
        wordBreak: "break-word"
    },
    emptyConfig: {
        color: "#64748b",
        fontSize: "14px"
    },
    primaryButton: {
        height: "44px",
        padding: "0 18px",
        borderRadius: "12px",
        border: "1px solid #1d4ed8",
        background: "#2563eb",
        color: "#fff",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: "15px"
    },
    secondaryButton: {
        height: "44px",
        padding: "0 16px",
        borderRadius: "12px",
        border: "1px solid #cbd5e1",
        background: "#fff",
        color: "#0f172a",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: "14px"
    },
    aiButton: {
        height: "44px",
        padding: "0 16px",
        borderRadius: "12px",
        border: "1px solid #7c3aed",
        background: "#7c3aed",
        color: "#fff",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: "14px"
    },
    message: {
        padding: "12px 14px",
        borderRadius: "12px",
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        color: "#1d4ed8"
    }
};