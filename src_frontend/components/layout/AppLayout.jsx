import Header from "./Header.jsx";

export default function AppLayout({ children }) {
    return (
        <div style={styles.page}>
            <Header />
            <main style={styles.main}>{children}</main>
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        background: "#f7f7f8"
    },
    main: {
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px"
    }
};