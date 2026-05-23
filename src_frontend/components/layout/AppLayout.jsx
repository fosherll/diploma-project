import Header from "./Header.jsx";

export default function AppLayout({ children }) {
    return (
        <div style={styles.root}>
            <Header />
            <main style={styles.main}>{children}</main>
        </div>
    );
}

const styles = {
    root: {
        minHeight: "100vh",
        background: "#f1f5f9"
    },
    main: {
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "32px 24px"
    }
};
