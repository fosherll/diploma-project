import { Link } from "react-router-dom";

export default function VacancyCard({ vacancy }) {
    return (
        <div style={styles.card}>
            <h3 style={styles.title}>{vacancy.title}</h3>
            <p style={styles.meta}>
                <strong>ID:</strong> {vacancy.id}
            </p>
            <p style={styles.meta}>
                <strong>Location:</strong> {vacancy.location || "—"}
            </p>
            <p style={styles.meta}>
                <strong>Employment:</strong> {vacancy.employment_type || "—"}
            </p>

            <Link to={`/vacancies/${vacancy.id}`} style={styles.button}>
                Open vacancy
            </Link>
        </div>
    );
}

const styles = {
    card: {
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
    },
    title: {
        margin: 0,
        fontSize: "18px"
    },
    meta: {
        margin: 0,
        fontSize: "14px"
    },
    button: {
        marginTop: "8px",
        display: "inline-block",
        textDecoration: "none",
        background: "#111",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: "8px",
        width: "fit-content"
    }
};