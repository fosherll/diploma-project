import VacancyCard from "./VacancyCard.jsx";

export default function VacancyList({ vacancies }) {
    if (!vacancies.length) {
        return <p>No vacancies found.</p>;
    }

    return (
        <div style={styles.grid}>
            {vacancies.map((vacancy) => (
                <VacancyCard key={vacancy.id} vacancy={vacancy} />
            ))}
        </div>
    );
}

const styles = {
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "16px"
    }
};