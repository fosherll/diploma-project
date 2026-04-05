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
import CandidateClusters from "../components/candidates/CandidateClusters.jsx";
import SkillGap from "../components/candidates/SkillGap.jsx";
import VacancyRecommendations from "../components/candidates/VacancyRecommendations.jsx";

export default function VacancyDetailsPage() {
    const { vacancyId } = useParams();

    const [vacancy, setVacancy] = useState(null);
    const [topCount, setTopCount] = useState(4);
    const [analyzeCount, setAnalyzeCount] = useState(100);

    const {
        criteria,
        setCriteria,
        criteriaDraft,
        setCriteriaDraft,
        reloadCriteria,
        saveCriteriaBeforeScoring
    } = useCriteriaEditor(vacancyId);

    const {
        runs,
        setRuns,
        selectedRunId,
        topData,
        selectedCandidate,
        summary,
        skillsPreview,
        selectedCompareIds,
        compareData,
        reloadRuns,
        loadTopForRun,
        loadLatestTop,
        handleCandidateSelect,
        handleSelectRun,
        handleToggleCandidate,
        clearRunCache
    } = useScoringRuns(vacancyId, topCount);

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

            try {
                await loadLatestTop(topCount);
            } catch {
                // hook сам сбросит данные, если результатов нет
            }
        } catch (err) {
            setError(err.message || "Failed to load vacancy page");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadInitialData();
    }, [vacancyId]);

    async function handleScoringFinished(result) {
        clearRunCache();

        const [runsData, criteriaData] = await Promise.all([
            reloadRuns().catch(() => []),
            reloadCriteria().catch(() => [])
        ]);

        setRuns(runsData || []);
        setCriteria(criteriaData || []);

        if (result?.runId) {
            await loadTopForRun(result.runId, topCount);
        } else {
            await loadLatestTop(topCount);
        }
    }

    async function handleTopCountChange(value) {
        const safeValue = Math.max(1, Number(value) || 4);
        setTopCount(safeValue);

        if (selectedRunId) {
            await loadTopForRun(selectedRunId, safeValue);
        } else {
            await loadLatestTop(safeValue);
        }
    }

    if (loading) return <p>Loading...</p>;
    if (error) return <p>{error}</p>;
    if (!vacancy && !isDemoVacancy) return <p>Vacancy not found.</p>;

    return (
        <div style={styles.page}>
            {!isDemoVacancy ? (
                <div style={styles.notice}>
                    <strong>Note:</strong> this vacancy is not preconfigured for the full demo.
                    For the best demo flow, use{" "}
                    <Link to="/vacancies/6348037">the prepared vacancy</Link>.
                </div>
            ) : null}

            <section style={styles.section}>
                <h1>{vacancy?.title || "Demo vacancy 6348037"}</h1>
                <p><strong>ID:</strong> {vacancy?.id || vacancyId}</p>
                <p><strong>Location:</strong> {vacancy?.location || "—"}</p>
                <p><strong>Employment:</strong> {vacancy?.employment_type || "—"}</p>
            </section>

            <section style={styles.section}>
                <h2>Criteria editor</h2>
                <CriteriaForm
                    vacancyId={vacancyId}
                    criteria={criteria}
                    onSaved={reloadCriteria}
                    onDraftChange={setCriteriaDraft}
                />
            </section>

            <section style={styles.section}>
                <h2>Current criteria</h2>
                <CriteriaList criteria={criteria} />
            </section>

            <section style={styles.section}>
                <h2>Scoring</h2>
                <RunScoringButton
                    vacancyId={vacancyId}
                    topCount={topCount}
                    onTopCountChange={handleTopCountChange}
                    analyzeCount={analyzeCount}
                    onAnalyzeCountChange={setAnalyzeCount}
                    onFinished={handleScoringFinished}
                    onBeforeRun={saveCriteriaBeforeScoring}
                />
            </section>

            <section style={styles.section}>
                <h2>Runs history</h2>
                <RunsHistory
                    runs={runs}
                    selectedRunId={selectedRunId}
                    onSelectRun={handleSelectRun}
                />
            </section>

            <section style={styles.section}>
                <RunsComparison runs={runs} vacancyId={vacancyId} />
            </section>

            <section style={styles.section}>
                <h2>Top candidates</h2>
                <TopCandidatesTable
                    items={topData?.items || []}
                    selectedResumeId={selectedCandidate?.resume_id}
                    onSelect={handleCandidateSelect}
                />
            </section>

            <section style={styles.section}>
                <CandidateSummary
                    summary={summary}
                    vacancyId={vacancyId}
                    vacancyTitle={vacancy?.title}
                />
                <VacancyRecommendations
                    vacancyId={vacancyId}
                    resumeId={selectedCandidate?.resume_id}
                />
            </section>

            <section style={styles.section}>
                <SkillsPreview preview={skillsPreview} />
            </section>

            <section style={styles.section}>
                <h2>Skill gap analysis</h2>
                <SkillGap vacancyId={vacancyId} runId={selectedRunId} />
            </section>

            <section style={styles.section}>
                <h2>Candidate clusters</h2>
                <CandidateClusters
                    vacancyId={vacancyId}
                    runId={selectedRunId}
                    onSelectCandidate={handleCandidateSelect}
                />
            </section>

            <section style={styles.section}>
                <CompareCandidates
                    compareData={compareData}
                    selectedCompareIds={selectedCompareIds}
                    onToggleCandidate={handleToggleCandidate}
                    topItems={topData?.items || []}
                />
            </section>
        </div>
    );
}

const styles = {
    page: {
        display: "grid",
        gap: "24px"
    },
    section: {
        display: "grid",
        gap: "12px"
    },
    notice: {
        background: "#fff8db",
        border: "1px solid #f0d98a",
        borderRadius: "10px",
        padding: "14px"
    }
};