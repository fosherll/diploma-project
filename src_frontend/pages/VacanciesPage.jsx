import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getVacancies } from "../api/vacanciesApi.js";

const PAGE_SIZE = 18;

export default function VacanciesPage() {
    const [items,   setItems]   = useState([]);
    const [total,   setTotal]   = useState(0);
    const [page,    setPage]    = useState(0);
    const [search,  setSearch]  = useState("");
    const [input,   setInput]   = useState("");
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState("");

    const load = useCallback(async (currentSearch, currentPage) => {
        try {
            setLoading(true);
            setError("");
            const data = await getVacancies(PAGE_SIZE, currentPage * PAGE_SIZE, currentSearch);
            setItems(data.items || []);
            setTotal(data.total || 0);
        } catch (err) {
            setError(err.message || "Помилка завантаження");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(search, page); }, [search, page]);

    function handleSearch(e) {
        e.preventDefault();
        const q = input.trim();
        setSearch(q);
        setPage(0);
    }

    function handleClear() {
        setInput("");
        setSearch("");
        setPage(0);
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div style={styles.page}>

            {/* Шапка */}
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>Вакансії</h1>
                    <p style={styles.subtitle}>
                        {total > 0 ? `${total.toLocaleString()} вакансій у базі` : "Оберіть вакансію для оцінки кандидатів"}
                    </p>
                </div>
            </div>

            {/* Demo карточка */}
            <div style={styles.demoCard}>
                <div style={styles.demoBadge}>Demo</div>
                <div style={styles.demoContent}>
                    <h3 style={styles.demoTitle}>Підготовлена вакансія</h3>
                    <p style={styles.demoText}>
                        Вакансія з налаштованими критеріями, скорингом та маппінгом навичок.
                    </p>
                </div>
                <Link to="/vacancies/6348037" style={styles.demoButton}>Відкрити →</Link>
            </div>

            {/* Пошук */}
            <form style={styles.searchRow} onSubmit={handleSearch}>
                <div style={styles.searchWrap}>
                    <span style={styles.searchIcon}>🔍</span>
                    <input
                        style={styles.searchInput}
                        placeholder="Пошук за назвою вакансії..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                    />
                    {input && (
                        <button type="button" style={styles.clearBtn} onClick={handleClear}>✕</button>
                    )}
                </div>
                <button type="submit" style={styles.searchBtn}>Знайти</button>
            </form>

            {/* Стан */}
            {loading && <div style={styles.status}>Завантаження...</div>}
            {error   && <div style={styles.errorBox}>{error}</div>}

            {/* Список */}
            {!loading && !error && items.length === 0 && (
                <div style={styles.empty}>
                    {search ? `Нічого не знайдено за запитом «${search}»` : "Вакансій не знайдено"}
                </div>
            )}

            {!loading && !error && items.length > 0 && (
                <>
                    <div style={styles.grid}>
                        {items.map(v => <VacancyCard key={v.id} vacancy={v} />)}
                    </div>

                    {/* Пагінація */}
                    {totalPages > 1 && (
                        <div style={styles.pagination}>
                            <button
                                style={{ ...styles.pageBtn, ...(page === 0 ? styles.pageBtnDisabled : {}) }}
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                            >
                                ← Назад
                            </button>

                            <div style={styles.pageNumbers}>
                                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                    const p = totalPages <= 7 ? i
                                        : page < 4 ? i
                                        : page > totalPages - 5 ? totalPages - 7 + i
                                        : page - 3 + i;
                                    return (
                                        <button
                                            key={p}
                                            style={{ ...styles.pageNum, ...(p === page ? styles.pageNumActive : {}) }}
                                            onClick={() => setPage(p)}
                                        >
                                            {p + 1}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.pageBtnDisabled : {}) }}
                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1}
                            >
                                Вперед →
                            </button>
                        </div>
                    )}
                    <div style={styles.pageInfo}>
                        Сторінка {page + 1} з {totalPages} · показано {items.length} з {total}
                    </div>
                </>
            )}
        </div>
    );
}

function VacancyCard({ vacancy }) {
    return (
        <div style={cardStyles.card}>
            <div style={cardStyles.body}>
                <h3 style={cardStyles.title}>{vacancy.title}</h3>
                <div style={cardStyles.meta}>
                    <span style={cardStyles.id}>ID {vacancy.id}</span>
                    {vacancy.location && <span style={cardStyles.chip}>📍 {vacancy.location}</span>}
                    {vacancy.employment_type && <span style={cardStyles.chip}>💼 {vacancy.employment_type}</span>}
                </div>
            </div>
            <Link to={`/vacancies/${vacancy.id}`} style={cardStyles.btn}>
                Відкрити →
            </Link>
        </div>
    );
}

const styles = {
    page:     { display: "grid", gap: "20px" },
    header:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
    title:    { margin: "0 0 4px", fontSize: "28px", fontWeight: 700, color: "#0f172a" },
    subtitle: { margin: 0, color: "#64748b", fontSize: "15px" },

    demoCard: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px",
        padding: "18px 22px", display: "flex", alignItems: "center", gap: "18px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
    demoBadge: {
        background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe",
        borderRadius: "6px", padding: "4px 10px", fontSize: "12px", fontWeight: 700, flexShrink: 0
    },
    demoContent: { flex: 1 },
    demoTitle:   { margin: "0 0 3px", fontSize: "15px", fontWeight: 600, color: "#0f172a" },
    demoText:    { margin: 0, fontSize: "13px", color: "#64748b" },
    demoButton: {
        textDecoration: "none", background: "#2563eb", color: "#fff",
        padding: "9px 18px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, flexShrink: 0
    },

    searchRow: { display: "flex", gap: "10px" },
    searchWrap: {
        flex: 1, display: "flex", alignItems: "center", gap: "8px",
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px",
        padding: "0 14px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
    },
    searchIcon:  { fontSize: "14px", color: "#94a3b8", flexShrink: 0 },
    searchInput: {
        flex: 1, border: "none", outline: "none", fontSize: "14px",
        color: "#0f172a", padding: "12px 0", background: "transparent"
    },
    clearBtn: {
        background: "none", border: "none", cursor: "pointer",
        color: "#94a3b8", fontSize: "14px", padding: "4px", flexShrink: 0
    },
    searchBtn: {
        background: "#2563eb", color: "#fff", border: "none", borderRadius: "12px",
        padding: "12px 22px", fontSize: "14px", fontWeight: 600, cursor: "pointer"
    },

    grid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "14px" },
    status: { color: "#64748b", fontSize: "14px", padding: "20px 0" },
    errorBox: { color: "#dc2626", background: "#fef2f2", borderRadius: "12px", padding: "14px 18px", fontSize: "14px" },
    empty:  { textAlign: "center", color: "#94a3b8", fontSize: "14px", padding: "48px 0" },

    pagination: {
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
    },
    pageBtn: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px",
        padding: "8px 16px", fontSize: "14px", cursor: "pointer", color: "#374151", fontWeight: 500
    },
    pageBtnDisabled: { opacity: 0.4, cursor: "default" },
    pageNumbers: { display: "flex", gap: "4px" },
    pageNum: {
        width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center",
        border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "14px",
        cursor: "pointer", background: "#fff", color: "#374151", fontWeight: 500
    },
    pageNumActive: { background: "#2563eb", color: "#fff", borderColor: "#2563eb" },
    pageInfo: { textAlign: "center", fontSize: "13px", color: "#94a3b8" }
};

const cardStyles = {
    card: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px",
        padding: "18px 20px", display: "flex", flexDirection: "column",
        gap: "14px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        transition: "box-shadow 0.15s"
    },
    body:  { display: "grid", gap: "8px", flex: 1 },
    title: { margin: 0, fontSize: "15px", fontWeight: 600, color: "#0f172a", lineHeight: 1.4 },
    meta:  { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" },
    id:    { fontSize: "12px", color: "#94a3b8" },
    chip: {
        fontSize: "12px", color: "#475569", background: "#f1f5f9",
        border: "1px solid #e2e8f0", borderRadius: "6px", padding: "2px 8px"
    },
    btn: {
        textDecoration: "none", background: "#0f172a", color: "#fff",
        padding: "9px 16px", borderRadius: "9px", fontSize: "13px",
        fontWeight: 600, alignSelf: "flex-start"
    }
};
