import { useState } from "react";
import { runScoring } from "../../api/scoringApi.js";

export default function RunScoringButton({
    vacancyId,
    topCount,
    onTopCountChange,
    analyzeCount,
    onAnalyzeCountChange,
    onFinished,
    onBeforeRun
}) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [isError, setIsError] = useState(false);

    async function handleClick() {
        try {
            setLoading(true);
            setMessage("");
            setIsError(false);

            if (onBeforeRun) await onBeforeRun();

            const safeAnalyzeCount = Math.max(1, Number(analyzeCount) || 100);
            const result = await runScoring(vacancyId, { analyzeCount: safeAnalyzeCount });

            setMessage(
                `Скоринг завершено. Run ID: ${String(result.runId).slice(0, 8)}… · Оцінено резюме: ${result.resumesCount}`
            );

            await onFinished?.(result);
        } catch (error) {
            setIsError(true);
            setMessage(error.message || "Помилка запуску скорингу");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={styles.wrapper}>
            <div style={styles.controls}>
                <div style={styles.field}>
                    <label style={styles.label} htmlFor="analyzeCount">
                        Кількість резюме для аналізу
                    </label>
                    <input
                        id="analyzeCount"
                        type="number"
                        min="1"
                        step="1"
                        value={analyzeCount}
                        onChange={(e) =>
                            onAnalyzeCountChange?.(Math.max(1, Number(e.target.value) || 100))
                        }
                        style={styles.input}
                    />
                </div>

                <div style={styles.field}>
                    <label style={styles.label} htmlFor="topCount">
                        Топ кандидатів для відображення
                    </label>
                    <input
                        id="topCount"
                        type="number"
                        min="1"
                        step="1"
                        value={topCount}
                        onChange={(e) => onTopCountChange?.(e.target.value)}
                        style={styles.input}
                    />
                </div>

                <div style={styles.buttonWrap}>
                    <button onClick={handleClick} disabled={loading} style={loading ? styles.buttonLoading : styles.button}>
                        {loading ? "Виконується…" : "▶ Запустити скоринг"}
                    </button>
                </div>
            </div>

            {message && (
                <div style={{ ...styles.message, ...(isError ? styles.messageError : styles.messageOk) }}>
                    {message}
                </div>
            )}
        </div>
    );
}

const styles = {
    wrapper: {
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px",
        padding: "20px", display: "grid", gap: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
    controls: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr auto",
        gap: "14px",
        alignItems: "end"
    },
    field:  { display: "grid", gap: "6px" },
    label:  { fontSize: "13px", fontWeight: 500, color: "#475569" },
    input: {
        padding: "10px 14px", borderRadius: "10px",
        border: "1px solid #e2e8f0", fontSize: "15px",
        background: "#f8fafc", outline: "none"
    },
    buttonWrap: { display: "flex", alignItems: "end" },
    button: {
        height: "44px", padding: "0 22px", borderRadius: "10px",
        border: "none", background: "#2563eb", color: "#fff",
        cursor: "pointer", fontWeight: 700, fontSize: "15px",
        whiteSpace: "nowrap"
    },
    buttonLoading: {
        height: "44px", padding: "0 22px", borderRadius: "10px",
        border: "none", background: "#93c5fd", color: "#fff",
        cursor: "not-allowed", fontWeight: 700, fontSize: "15px",
        whiteSpace: "nowrap"
    },
    message: {
        padding: "12px 16px", borderRadius: "10px",
        fontSize: "13px", fontWeight: 500
    },
    messageOk: {
        background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d"
    },
    messageError: {
        background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626"
    }
};
