import { useState } from "react";
import { runClustering, buildClusterPlot } from "../api/clusteringApi.js";

const COLORS = [
    { bg: "#eff6ff", border: "#bfdbfe", badge: "#2563eb" },
    { bg: "#f0fdf4", border: "#bbf7d0", badge: "#16a34a" },
    { bg: "#fdf4ff", border: "#e9d5ff", badge: "#9333ea" },
    { bg: "#fff7ed", border: "#fed7aa", badge: "#ea580c" },
    { bg: "#fef2f2", border: "#fecaca", badge: "#dc2626" },
    { bg: "#ecfdf5", border: "#a7f3d0", badge: "#059669" },
    { bg: "#fffbeb", border: "#fde68a", badge: "#d97706" },
    { bg: "#f0f9ff", border: "#bae6fd", badge: "#0284c7" },
    { bg: "#faf5ff", border: "#ddd6fe", badge: "#7c3aed" },
    { bg: "#fafafa", border: "#e5e7eb", badge: "#6b7280" },
];

function ClusterTable({ title, clusters }) {
    return (
        <div style={styles.card}>
            <h3 style={styles.cardTitle}>{title}</h3>
            <div style={styles.clusterList}>
                {(clusters || []).map((cl, i) => {
                    const color = COLORS[i % COLORS.length];
                    return (
                        <div key={cl.cluster}
                            style={{ ...styles.clusterRow, background: color.bg, borderColor: color.border }}>
                            <span style={{ ...styles.badge, background: color.badge }}>
                                {cl.cluster}
                            </span>
                            <div style={styles.clusterInfo}>
                                {cl.name && (
                                    <span style={{ ...styles.clusterName, color: color.badge }}>
                                        {cl.name}
                                    </span>
                                )}
                                <div style={styles.skillsList}>
                                    {cl.top_skills.length > 0
                                        ? cl.top_skills.map(s => (
                                            <span key={s} style={{ ...styles.skillTag, color: color.badge, borderColor: color.border }}>
                                                {s}
                                            </span>
                                        ))
                                        : <span style={{ color: "#94a3b8", fontSize: "13px" }}>—</span>
                                    }
                                </div>
                                <span style={styles.size}>{cl.size} документів</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function ClusteringPage() {
    const [kResumes,    setKResumes]    = useState(10);
    const [kVacancies,  setKVacancies]  = useState(15);
    const [data,        setData]        = useState(null);
    const [loading,     setLoading]     = useState(false);
    const [plotLoading, setPlotLoading] = useState(false);
    const [error,       setError]       = useState("");

    async function handleRun() {
        setLoading(true);
        setError("");
        setData(null);
        try {
            const res = await runClustering(kResumes, kVacancies);
            setData(res);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function handlePlot() {
        setPlotLoading(true);
        setError("");
        try {
            const res = await buildClusterPlot(kResumes, kVacancies);
            setData(res);
        } catch (e) {
            setError(e.message);
        } finally {
            setPlotLoading(false);
        }
    }

    const busy = loading || plotLoading;

    return (
        <div style={styles.page}>
            <h1 style={styles.h1}>Кластеризація навичок</h1>

            <div style={styles.controls}>
                <div style={styles.sliders}>
                    <div style={styles.sliderGroup}>
                        <label style={styles.label}>
                            Кластери резюме: <b>{kResumes}</b>
                        </label>
                        <input
                            type="range" min={2} max={20} value={kResumes}
                            onChange={e => setKResumes(Number(e.target.value))}
                            style={styles.slider}
                            disabled={busy}
                        />
                        <div style={styles.sliderTicks}>
                            <span>2</span><span>10</span><span>20</span>
                        </div>
                    </div>

                    <div style={styles.sliderGroup}>
                        <label style={styles.label}>
                            Кластери вакансій: <b>{kVacancies}</b>
                        </label>
                        <input
                            type="range" min={2} max={25} value={kVacancies}
                            onChange={e => setKVacancies(Number(e.target.value))}
                            style={styles.slider}
                            disabled={busy}
                        />
                        <div style={styles.sliderTicks}>
                            <span>2</span><span>13</span><span>25</span>
                        </div>
                    </div>
                </div>

                <div style={styles.buttons}>
                    <button style={styles.btnPrimary} onClick={handleRun} disabled={busy}>
                        {loading ? "Виконується..." : "Кластеризувати"}
                    </button>
                    {data && (
                        <button style={styles.btnSecondary} onClick={handlePlot} disabled={busy}>
                            {plotLoading ? "Будується графік (~2 хв)..." : "Побудувати t-SNE графік"}
                        </button>
                    )}
                </div>
            </div>

            {error && <p style={styles.error}>{error}</p>}
            {loading     && <p style={styles.hint}>K-Means кластеризація... зачекайте ~30 сек</p>}
            {plotLoading && <p style={styles.hint}>Будується t-SNE графік... зачекайте ~2 хв</p>}

            {data && !loading && (
                <>
                    <div style={styles.grid}>
                        <ClusterTable
                            title={`Резюме — ${data.kResumes} кластери`}
                            clusters={data.resume_clusters}
                        />
                        <ClusterTable
                            title={`Вакансії — ${data.kVacancies} кластери`}
                            clusters={data.vacancy_clusters}
                        />
                    </div>

                    {data.plot && (
                        <div style={styles.plotWrap}>
                            <h3 style={styles.plotTitle}>t-SNE візуалізація</h3>
                            <p style={styles.plotHint}>
                                Круглі точки — резюме, квадратні — вакансії. Колір відповідає кластеру.
                            </p>
                            <img
                                src={`data:image/png;base64,${data.plot}`}
                                alt="cluster plot"
                                style={styles.plot}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

const styles = {
    page:  { display: "grid", gap: "24px" },
    h1:    { margin: 0 },

    controls: {
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "20px 24px",
        display: "grid",
        gap: "20px"
    },
    sliders: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" },
    sliderGroup: { display: "grid", gap: "6px" },
    label:  { fontSize: "14px", color: "#374151" },
    slider: { width: "100%", cursor: "pointer" },
    sliderTicks: {
        display: "flex",
        justifyContent: "space-between",
        fontSize: "11px",
        color: "#9ca3af"
    },

    buttons: { display: "flex", gap: "12px", flexWrap: "wrap" },
    btnPrimary: {
        padding: "10px 20px",
        background: "#111",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: 600
    },
    btnSecondary: {
        padding: "10px 20px",
        background: "#fff",
        color: "#111",
        border: "1px solid #d1d5db",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: 600
    },

    error: { color: "#dc2626", margin: 0 },
    hint:  { color: "#64748b", margin: 0, fontSize: "14px" },

    grid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px"
    },

    card: {
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "20px",
        display: "grid",
        gap: "12px"
    },
    cardTitle: { margin: 0, fontSize: "16px" },
    clusterList: { display: "grid", gap: "8px" },
    clusterRow: {
        border: "1px solid",
        borderRadius: "12px",
        padding: "10px 14px",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px"
    },
    badge: {
        color: "#fff",
        borderRadius: "6px",
        padding: "2px 10px",
        fontSize: "13px",
        fontWeight: 700,
        flexShrink: 0,
        minWidth: "28px",
        textAlign: "center"
    },
    clusterInfo: { display: "grid", gap: "6px", flex: 1 },
    skillsList:  { display: "flex", flexWrap: "wrap", gap: "6px" },
    skillTag: {
        border: "1px solid",
        borderRadius: "999px",
        padding: "2px 10px",
        fontSize: "12px",
        fontWeight: 500,
        background: "#fff"
    },
    clusterName: { fontSize: "14px", fontWeight: 700, marginBottom: "4px" },
    size: { fontSize: "12px", color: "#94a3b8" },

    plotWrap: {
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "20px",
        display: "grid",
        gap: "8px"
    },
    plotTitle: { margin: 0, fontSize: "16px" },
    plotHint:  { margin: 0, fontSize: "13px", color: "#64748b" },
    plot: {
        width: "100%",
        borderRadius: "8px",
        border: "1px solid #f1f5f9"
    }
};
