export default function SkillsPreview({ preview }) {
    if (!preview) {
        return <p>Select a candidate to view skills preview.</p>;
    }
    if (!preview || preview.available === false) {
        return null;
    }
}


const styles = {
    card: {
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "12px",
        padding: "16px"
    },
    title: {
        marginTop: 0
    },
    columns: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px"
    },
    block: {
        background: "#fafafa",
        borderRadius: "10px",
        padding: "12px"
    },
    warningBox: {
        background: "#fff7ed",
        border: "1px solid #fdba74",
        color: "#9a3412",
        borderRadius: "10px",
        padding: "12px"
    },
    list: {
        margin: 0,
        paddingLeft: "18px",
        display: "grid",
        gap: "10px"
    }
};