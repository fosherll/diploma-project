import { Link } from "react-router-dom";

export default function VacancyCard({ vacancy }) {
    return (
        <div style={styles.card}>
            <div style={styles.body}>
                <h3 style={styles.title}>{vacancy.title}</h3>
                <div style={styles.meta}>
                    <span style={styles.id}>ID {vacancy.id}</span>
                    {vacancy.location && <span style={styles.chip}>📍 {vacancy.location}</span>}
                    {vacancy.employment_type && <span style={styles.chip}>💼 {vacancy.employment_type}</span>}
                </div>
            </div>
            <Link to={`/vacancies/${vacancy.id}`} style={styles.btn}>
                Відкрити →
            </Link>
        </div>
    );
}

const styles = {
    card: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px",
        padding: "18px 20px", display: "flex", flexDirection: "column",
        gap: "14px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
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
