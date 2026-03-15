import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getVacancies } from "../api/vacanciesApi.js";
import VacancyList from "../components/vacancies/VacancyList.jsx";

export default function VacanciesPage() {
    const [vacancies, setVacancies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function load() {
            try {
                setLoading(true);
                setError("");
                const data = await getVacancies(20, 0);
                setVacancies(data || []);
            } catch (err) {
                setError(err.message || "Failed to load vacancies");
            } finally {
                setLoading(false);
            }
        }

        load();
    }, []);

    return (
        <div style={styles.page}>
            <div style={styles.topBlock}>
                <h1>Vacancies</h1>

                <div style={styles.demoCard}>
                    <h3 style={styles.demoTitle}>Demo vacancy</h3>
                    <p style={styles.demoText}>
                        Use the prepared vacancy with configured criteria, scoring, summary and skill mapping.
                    </p>
                    <Link to="/vacancies/6348037" style={styles.demoButton}>
                        Open demo vacancy
                    </Link>
                </div>
            </div>

            {loading ? <p>Loading...</p> : null}
            {error ? <p>{error}</p> : null}
            {!loading && !error ? <VacancyList vacancies={vacancies} /> : null}
        </div>
    );
}

const styles = {
    page: {
        display: "grid",
        gap: "20px"
    },
    topBlock: {
        display: "grid",
        gap: "16px"
    },
    demoCard: {
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "12px",
        padding: "16px"
    },
    demoTitle: {
        margin: "0 0 8px 0"
    },
    demoText: {
        margin: "0 0 12px 0"
    },
    demoButton: {
        display: "inline-block",
        textDecoration: "none",
        background: "#111",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: "8px"
    }
};