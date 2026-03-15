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

    async function handleClick() {
        try {
            setLoading(true);
            setMessage("");

            if (onBeforeRun) {
                await onBeforeRun();
            }

            const safeAnalyzeCount = Math.max(1, Number(analyzeCount) || 100);

            const result = await runScoring(vacancyId, {
                analyzeCount: safeAnalyzeCount
            });

            setMessage(
                `Scoring completed. Run ID: ${result.runId}. Analyzed resumes: ${result.resumesCount}.`
            );

            await onFinished?.(result);
        } catch (error) {
            setMessage(error.message || "Failed to run scoring");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={styles.wrapper}>
            <div style={styles.controls}>
                <div style={styles.field}>
                    <label style={styles.label} htmlFor="analyzeCount">
                        Analyze resumes
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
                        Top candidates to show
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
                    <button onClick={handleClick} disabled={loading} style={styles.button}>
                        {loading ? "Running..." : "Run scoring"}
                    </button>
                </div>
            </div>

            {message ? <p style={styles.message}>{message}</p> : null}
        </div>
    );
}

const styles = {
    wrapper: {
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "12px",
        padding: "16px",
        display: "grid",
        gap: "14px"
    },
    controls: {
        display: "grid",
        gridTemplateColumns: "220px 220px 180px",
        gap: "12px",
        alignItems: "end"
    },
    field: {
        display: "grid",
        gap: "6px"
    },
    label: {
        fontSize: "13px",
        color: "#555"
    },
    input: {
        padding: "10px 12px",
        borderRadius: "8px",
        border: "1px solid #ccc",
        fontSize: "14px"
    },
    buttonWrap: {
        display: "flex",
        alignItems: "end"
    },
    button: {
        height: "42px",
        padding: "0 16px",
        borderRadius: "8px",
        border: "1px solid #1d4ed8",
        background: "#2563eb",
        color: "#fff",
        cursor: "pointer",
        fontWeight: 600
    },
    message: {
        margin: 0
    }
};