import { Link, useLocation } from "react-router-dom";

export default function Header() {
    const { pathname } = useLocation();

    return (
        <header style={styles.header}>
            <div style={styles.inner}>
                <Link to="/" style={styles.logo}>
                    <span style={styles.logoIcon}>◈</span>
                    Скоринг кандидатів
                </Link>
                <nav style={styles.nav}>
                    <NavLink to="/" active={pathname === "/"}>Вакансії</NavLink>
                    <NavLink to="/clustering" active={pathname === "/clustering"}>Кластеризація</NavLink>
                </nav>
            </div>
        </header>
    );
}

function NavLink({ to, children, active }) {
    return (
        <Link to={to} style={{ ...styles.navLink, ...(active ? styles.navLinkActive : {}) }}>
            {children}
        </Link>
    );
}

const styles = {
    header: {
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
    },
    inner: {
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "0 24px",
        height: "60px",
        display: "flex",
        alignItems: "center",
        gap: "40px"
    },
    logo: {
        textDecoration: "none",
        color: "#0f172a",
        fontSize: "17px",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: "8px"
    },
    logoIcon: {
        color: "#2563eb",
        fontSize: "20px"
    },
    nav: {
        display: "flex",
        gap: "4px"
    },
    navLink: {
        textDecoration: "none",
        color: "#64748b",
        fontSize: "14px",
        fontWeight: 500,
        padding: "6px 14px",
        borderRadius: "8px",
        transition: "all 0.15s"
    },
    navLinkActive: {
        color: "#2563eb",
        background: "#eff6ff"
    }
};
