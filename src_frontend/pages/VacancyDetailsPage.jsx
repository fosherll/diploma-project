import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getVacancyById } from "../api/vacanciesApi.js";
import { useCriteriaEditor } from "../hooks/useCriteriaEditor.js";
import { useScoringRuns } from "../hooks/useScoringRuns.js";
import CriteriaList from "../components/criteria/CriteriaList.jsx";
import CriteriaForm from "../components/criteria/CriteriaForm.jsx";
import RunScoringButton from "../components/scoring/RunScoringButton.jsx";
import RunsHistory from "../components/scoring/RunsHistory.jsx";
import RunsComparison from "../components/scoring/RunsComparison.jsx";
import TopCandidatesTable from "../components/candidates/TopCandidatesTable.jsx";
import CandidateSummary from "../components/candidates/CandidateSummary.jsx";
import SkillsPreview from "../components/candidates/SkillsPreview.jsx";
import CompareCandidates from "../components/candidates/CompareCandidates.jsx";
import SkillGap from "../components/candidates/SkillGap.jsx";
import VacancyRecommendations from "../components/candidates/VacancyRecommendations.jsx";

export default function VacancyDetailsPage() {
    const { vacancyId } = useParams();
    const [vacancy, setVacancy] = useState(null);
    const [topCount, setTopCount] = useState(4);
    const [analyzeCount, setAnalyzeCount] = useState(100);

    const { criteria, setCriteria, criteriaDraft, setCriteriaDraft, reloadCriteria, saveCriteriaBeforeScoring } = useCriteriaEditor(vacancyId);
    const { runs, setRuns, selectedRunId, topData, selectedCandidate, summary, skillsPreview, selectedCompareIds, compareData, reloadRuns, loadTopForRun, loadLatestTop, handleCandidateSelect, handleSelectRun, handleToggleCandidate, clearRunCache } = useScoringRuns(vacancyId, topCount);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const isDemoVacancy = String(vacancyId) === "6348037";

    async function loadInitialData() {
        try {
            setLoading(true);
            setError("");
            const [vacancyData, criteriaData, runsData] = await Promise.all([
                getVacancyById(vacancyId).catch(() => null),
                reloadCriteria().catch(() => []),
                reloadRuns().catch(() => [])
            ]);
            setVacancy(vacancyData);
            setCriteria(criteriaData || []);
            setRuns(runsData || []);
            try { await loadLatestTop(topCount); } catch { /* no results yet */ }
        } catch (err) {
            setError(err.message || "Помилка завантаження сторінки вакансії");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadInitialData(); }, [vacancyId]);

    async function handleScoringFinished(result) {
        clearRunCache();
        const [runsData, criteriaData] = await Promise.all([
            reloadRuns().catch(() => []),
            reloadCriteria().catch(() => [])
        ]);
        setRuns(runsData || []);
        setCriteria(criteriaData || []);
        if (result?.runId) await loadTopForRun(result.runId, topCount);
        else await loadLatestTop(topCount);
    }

    async function handleTopCountChange(value) {
        const safeValue = Math.max(1, Number(value) || 4);
        setTopCount(safeValue);
        if (selectedRunId) await loadTopForRun(selectedRunId, safeValue);
        else await loadLatestTop(safeValue);
    }

    if (loading) return <div style={styles.status}>Завантаження...</div>;
    if (error)   return <div style={styles.errorMsg}>{error}</div>;
    if (!vacancy && !isDemoVacancy) return <div style={styles.status}>Вакансію не знайдено.</div>;

    return (
        <div style={styles.page}>

            {/* Шапка вакансії */}
            <div style={styles.vacancyHeader}>
                <Link to="/" style={styles.backLink}>← Всі вакансії</Link>
                <h1 style={styles.vacancyTitle}>{vacancy?.title || "Демо вакансія"}</h1>
                <div style={styles.vacancyMeta}>
                    {vacancy?.location && <MetaChip label="📍" value={vacancy.location} />}
                    {vacancy?.employment_type && <MetaChip label="💼" value={vacancy.employment_type} />}
                    <MetaChip label="ID" value={vacancy?.id || vacancyId} />
                </div>
                {!isDemoVacancy && (
                    <div style={styles.notice}>
                        Для повної демонстрації використайте{" "}
                        <Link to="/vacancies/6348037" style={styles.noticeLink}>підготовлену вакансію</Link>.
                    </div>
                )}
            </div>

            {/* Критерії */}
            <Section title="Редактор критеріїв">
                <CriteriaForm vacancyId={vacancyId} criteria={criteria} onSaved={reloadCriteria} onDraftChange={setCriteriaDraft} />
            </Section>

            <Section title="Поточні критерії">
                <CriteriaList criteria={criteria} />
            </Section>

            {/* Скоринг */}
            <Section title="Запуск скорингу">
                <RunScoringButton
                    vacancyId={vacancyId}
                    topCount={topCount}
                    onTopCountChange={handleTopCountChange}
                    analyzeCount={analyzeCount}
                    onAnalyzeCountChange={setAnalyzeCount}
                    onFinished={handleScoringFinished}
                    onBeforeRun={saveCriteriaBeforeScoring}
                />
            </Section>

            <Section title="Історія запусків">
                <RunsHistory runs={runs} selectedRunId={selectedRunId} onSelectRun={handleSelectRun} />
            </Section>

            <Section>
                <RunsComparison runs={runs} vacancyId={vacancyId} />
            </Section>

            {/* Результати */}
            <Section title="Топ кандидати">
                <TopCandidatesTable
                    items={topData?.items || []}
                    selectedResumeId={selectedCandidate?.resume_id}
                    onSelect={handleCandidateSelect}
                />
            </Section>

            {/* Деталі кандидата */}
            {selectedCandidate && (
                <div style={styles.candidateGrid}>
                    <div style={styles.candidateMain}>
                        <SectionLabel>Картка кандидата</SectionLabel>
                        <CandidateSummary summary={summary} />
                        <div style={{ marginTop: "16px" }}>
                            <SkillsPreview preview={skillsPreview} />
                        </div>
                    </div>
                    <div style={styles.candidateSide}>
                        <SectionLabel>Рекомендовані вакансії</SectionLabel>
                        <VacancyRecommendations vacancyId={vacancyId} resumeId={selectedCandidate?.resume_id} />
                    </div>
                </div>
            )}

            <Section title="Аналіз прогалин у навичках">
                <SkillGap vacancyId={vacancyId} runId={selectedRunId} />
            </Section>

            <Section>
                <CompareCandidates
                    compareData={compareData}
                    selectedCompareIds={selectedCompareIds}
                    onToggleCandidate={handleToggleCandidate}
                    topItems={topData?.items || []}
                />
            </Section>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <div style={sectionStyles.wrap}>
            {title && <h2 style={sectionStyles.title}>{title}</h2>}
            {children}
        </div>
    );
}

function SectionLabel({ children }) {
    return <h3 style={sectionStyles.label}>{children}</h3>;
}

function MetaChip({ label, value }) {
    return (
        <span style={chipStyles.chip}>
            <span style={chipStyles.label}>{label}</span>
            {value}
        </span>
    );
}

const sectionStyles = {
    wrap:  { display: "grid", gap: "12px" },
    title: { margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" },
    label: { margin: "0 0 10px", fontSize: "15px", fontWeight: 600, color: "#374151" }
};

const chipStyles = {
    chip: {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: "#f1f5f9",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "4px 12px",
        fontSize: "13px",
        color: "#475569"
    },
    label: { color: "#94a3b8", fontSize: "11px", fontWeight: 600 }
};

const styles = {
    page: { display: "grid", gap: "28px" },

    vacancyHeader: {
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "24px",
        display: "grid",
        gap: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
    backLink: {
        textDecoration: "none",
        color: "#64748b",
        fontSize: "13px",
        fontWeight: 500
    },
    vacancyTitle: {
        margin: 0,
        fontSize: "26px",
        fontWeight: 800,
        color: "#0f172a"
    },
    vacancyMeta: {
        display: "flex",
        flexWrap: "wrap",
        gap: "8px"
    },
    notice: {
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: "10px",
        padding: "10px 14px",
        fontSize: "13px",
        color: "#92400e"
    },
    noticeLink: { color: "#d97706", fontWeight: 600 },

    candidateGrid: {
        display: "grid",
        gridTemplateColumns: "1fr 340px",
        gap: "20px",
        alignItems: "start"
    },
    candidateMain: { display: "grid", gap: "0" },
    candidateSide: { display: "grid", gap: "0" },

    status:   { color: "#64748b", textAlign: "center", padding: "60px 0" },
    errorMsg: { color: "#dc2626", textAlign: "center", padding: "60px 0" }
};
