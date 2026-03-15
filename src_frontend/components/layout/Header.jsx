import { Link } from "react-router-dom";

export default function Header() {
    return (
        <header style={styles.header}>
            <div style={styles.inner}>
                <Link to="/" style={styles.logo}>
                    Candidate Scoring System
                </Link>
            </div>
        </header>
    );
}

const styles = {
    header: {
        borderBottom: "1px solid #ddd",
        padding: "16px 24px",
        background: "#fff"
    },
    inner: {
        maxWidth: "1200px",
        margin: "0 auto"
    },
    logo: {
        textDecoration: "none",
        color: "#111",
        fontSize: "20px",
        fontWeight: 700
    }
};