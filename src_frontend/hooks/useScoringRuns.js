import { useCallback, useEffect, useRef, useState } from "react";
import {
    compareCandidates,
    getCandidateSummary,
    getRunResults,
    getRuns,
    getSkillsPreview,
    getTopCandidates
} from "../api/resultsApi.js";

export function useScoringRuns(vacancyId, topCount) {
    const [runs, setRuns] = useState([]);
    const [selectedRunId, setSelectedRunId] = useState(null);

    const [topData, setTopData] = useState({ run_id: null, items: [] });
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [summary, setSummary] = useState(null);
    const [skillsPreview, setSkillsPreview] = useState(null);

    const [selectedCompareIds, setSelectedCompareIds] = useState([]);
    const [compareData, setCompareData] = useState(null);

    const runCacheRef = useRef(new Map());

    const resetCandidateViews = useCallback(() => {
        setSelectedCandidate(null);
        setSummary(null);
        setSkillsPreview(null);
        setSelectedCompareIds([]);
        setCompareData(null);
    }, []);

    const reloadRuns = useCallback(async () => {
        const runsData = await getRuns(vacancyId).catch(() => []);
        setRuns(runsData || []);
        return runsData || [];
    }, [vacancyId]);

    const loadCandidateData = useCallback(
        async (resumeId, runId) => {
            if (!resumeId || !runId) {
                setSummary(null);
                setSkillsPreview(null);
                return;
            }

            const summaryPromise = getCandidateSummary(vacancyId, resumeId, runId)
                .then((data) => setSummary(data))
                .catch(() => setSummary(null));

            const previewPromise = getSkillsPreview(vacancyId, resumeId, runId)
                .then((data) => setSkillsPreview(data))
                .catch(() =>
                    setSkillsPreview({
                        available: false,
                        reason: "vacancy_mapping_not_found",
                        matched: [],
                        missing: []
                    })
                );

            await Promise.all([summaryPromise, previewPromise]);
        },
        [vacancyId]
    );

    const applyTopItems = useCallback(
        async (items, runId) => {
            const safeItems = Array.isArray(items) ? items : [];

            setTopData({
                run_id: runId || null,
                items: safeItems
            });

            setSelectedRunId(runId || null);
            setSelectedCompareIds([]);
            setCompareData(null);

            if (safeItems.length > 0 && runId) {
                const first = safeItems[0];
                setSelectedCandidate(first);
                await loadCandidateData(first.resume_id, runId);
            } else {
                resetCandidateViews();
            }
        },
        [loadCandidateData, resetCandidateViews]
    );

    const loadTopForRun = useCallback(
        async (runId, limitValue = topCount) => {
            if (!runId) {
                await applyTopItems([], null);
                return [];
            }

            const safeLimit = Math.max(1, Number(limitValue) || 1);
            const cacheKey = `${runId}:${safeLimit}`;

            if (runCacheRef.current.has(cacheKey)) {
                const cachedItems = runCacheRef.current.get(cacheKey) || [];
                await applyTopItems(cachedItems, runId);
                return cachedItems;
            }

            const items = await getRunResults(vacancyId, runId, safeLimit).catch(() => []);
            runCacheRef.current.set(cacheKey, items || []);
            await applyTopItems(items || [], runId);
            return items || [];
        },
        [applyTopItems, topCount, vacancyId]
    );

    const loadLatestTop = useCallback(
        async (limitValue = topCount) => {
            const safeLimit = Math.max(1, Number(limitValue) || 1);

            try {
                const top = await getTopCandidates(vacancyId, safeLimit);
                const items = top?.items || [];
                const runId = top?.run_id || null;

                if (runId) {
                    runCacheRef.current.set(`${runId}:${safeLimit}`, items);
                }

                await applyTopItems(items, runId);
                return { items, runId };
            } catch {
                await applyTopItems([], null);
                return { items: [], runId: null };
            }
        },
        [applyTopItems, topCount, vacancyId]
    );

    const handleCandidateSelect = useCallback(
        async (candidate) => {
            if (!selectedRunId || !candidate) return;

            setSelectedCandidate(candidate);
            await loadCandidateData(candidate.resume_id, selectedRunId);
        },
        [loadCandidateData, selectedRunId]
    );

    const handleSelectRun = useCallback(
        async (run) => {
            if (!run?.run_id) return;
            await loadTopForRun(run.run_id, topCount);
        },
        [loadTopForRun, topCount]
    );

    const handleToggleCandidate = useCallback((resumeId) => {
        setSelectedCompareIds((prev) => {
            let updated = [...prev];

            if (updated.includes(resumeId)) {
                return updated.filter((id) => id !== resumeId);
            }

            if (updated.length >= 2) {
                return updated;
            }

            return [...updated, resumeId];
        });
    }, []);

    useEffect(() => {
        async function loadCompare() {
            if (selectedCompareIds.length !== 2 || !selectedRunId) {
                setCompareData(null);
                return;
            }

            try {
                const data = await compareCandidates(
                    vacancyId,
                    selectedCompareIds[0],
                    selectedCompareIds[1],
                    selectedRunId
                );
                setCompareData(data);
            } catch {
                setCompareData(null);
            }
        }

        loadCompare();
    }, [selectedCompareIds, selectedRunId, vacancyId]);

    const clearRunCache = useCallback(() => {
        runCacheRef.current.clear();
    }, []);

    return {
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
    };
}