import { useCallback, useState } from "react";
import { getCriteria, updateCriteria } from "../api/criteriaApi.js";

export function useCriteriaEditor(vacancyId) {
    const [criteria, setCriteria] = useState([]);
    const [criteriaDraft, setCriteriaDraft] = useState([]);

    const reloadCriteria = useCallback(async () => {
        const criteriaData = await getCriteria(vacancyId).catch(() => []);
        setCriteria(criteriaData || []);
        setCriteriaDraft(criteriaData || []);
        return criteriaData || [];
    }, [vacancyId]);

    const saveCriteriaBeforeScoring = useCallback(async () => {
        const source =
            Array.isArray(criteriaDraft) && criteriaDraft.length ? criteriaDraft : criteria;

        const payload = source.map((item) => ({
            name: item.name,
            weight: Number(item.weight ?? 1),
            calc_type: item.calc_type,
            config: {
                ...(item.config || {}),
                required: Boolean(item?.config?.required)
            },
            is_enabled: Boolean(item.is_enabled)
        }));

        await updateCriteria(vacancyId, payload);
        return await reloadCriteria();
    }, [vacancyId, criteria, criteriaDraft, reloadCriteria]);

    return {
        criteria,
        setCriteria,
        criteriaDraft,
        setCriteriaDraft,
        reloadCriteria,
        saveCriteriaBeforeScoring
    };
}