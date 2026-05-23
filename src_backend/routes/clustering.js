import { spawn }    from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath }    from "node:url";
import os from "node:os";

const __dirname   = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = resolve(__dirname, "../../scripts/import");
const PLOT_PATH   = resolve(SCRIPTS_DIR, "cluster_plot.png");

// Зберігаємо звіт у тимчасову директорію — nodemon її не дивиться
const TMP_DIR     = join(os.tmpdir(), "diploma_cluster");
const REPORT_PATH = join(TMP_DIR, "cluster_report.json");

const PYTHON_CMD = process.platform === "win32" ? "python" : "python3";

// Створюємо тимчасову директорію при старті
mkdir(TMP_DIR, { recursive: true }).catch(() => {});

/**
 * Запускає Python скрипт.
 * Python виводить __CLUSTER_REPORT__:{json} у stderr — читаємо звідти.
 */
function runPython(args, timeoutMs = 420_000) {
    return new Promise((res, rej) => {
        const proc = spawn(PYTHON_CMD, ["-X", "utf8", "cluster_skills.py", ...args], {
            cwd:   SCRIPTS_DIR,
            shell: true
        });

        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", d => { stdout += d.toString(); });
        proc.stderr.on("data", d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill();
            rej(new Error("Clustering timed out (>7 min)"));
        }, timeoutMs);

        proc.on("error", err => {
            clearTimeout(timer);
            rej(new Error(`Не вдалося запустити Python: ${err.message}`));
        });

        proc.on("close", code => {
            clearTimeout(timer);
            if (code === 0) {
                // Шукаємо __CLUSTER_REPORT__:{json} у stderr
                const marker = "__CLUSTER_REPORT__:";
                const markerIdx = stderr.indexOf(marker);
                let report = null;
                if (markerIdx !== -1) {
                    try {
                        const jsonStr = stderr.slice(markerIdx + marker.length).split("\n")[0];
                        report = JSON.parse(jsonStr);
                    } catch (e) {
                        console.error("[clustering] stderr JSON parse error:", e.message);
                    }
                }
                res({ stdout, stderr, report });
            } else {
                const msg = (stderr || stdout).slice(-800);
                rej(new Error(`Python завершився з кодом ${code}: ${msg}`));
            }
        });
    });
}

export default async function clusteringRoutes(app) {

    // GET /clustering/results — останній збережений звіт (з tmp)
    app.get("/results", async () => {
        try {
            const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
            return { ok: true, ...report };
        } catch {
            return { ok: true, resume_clusters: [], vacancy_clusters: [] };
        }
    });

    // POST /clustering/run — K-Means без графіку (~15-30 сек)
    app.post("/run", {
        schema: {
            body: {
                type: "object",
                properties: {
                    kResumes:   { type: "integer", minimum: 2, maximum: 30 },
                    kVacancies: { type: "integer", minimum: 2, maximum: 30 }
                }
            }
        }
    }, async (req, reply) => {
        const kResumes   = req.body?.kResumes   ?? 10;
        const kVacancies = req.body?.kVacancies ?? 15;

        let result;
        try {
            result = await runPython([
                "--k-resumes",   String(kResumes),
                "--k-vacancies", String(kVacancies),
                "--no-plot"
            ]);
        } catch (err) {
            return reply.code(500).send({ ok: false, error: err.message });
        }

        if (!result.report) {
            return reply.code(500).send({ ok: false, error: "Не вдалося отримати звіт від Python" });
        }

        // Зберігаємо у tmp (без запису в src/scripts — щоб не тригерити nodemon)
        writeFile(REPORT_PATH, JSON.stringify(result.report, null, 2), "utf8").catch(() => {});

        return { ok: true, kResumes, kVacancies, ...result.report };
    });

    // POST /clustering/plot — K-Means + t-SNE (~2 хв)
    app.post("/plot", {
        schema: {
            body: {
                type: "object",
                properties: {
                    kResumes:   { type: "integer", minimum: 2, maximum: 30 },
                    kVacancies: { type: "integer", minimum: 2, maximum: 30 }
                }
            }
        }
    }, async (req, reply) => {
        const kResumes   = req.body?.kResumes   ?? 10;
        const kVacancies = req.body?.kVacancies ?? 15;

        let result;
        try {
            result = await runPython([
                "--k-resumes",   String(kResumes),
                "--k-vacancies", String(kVacancies)
            ]);
        } catch (err) {
            return reply.code(500).send({ ok: false, error: err.message });
        }

        if (!result.report) {
            return reply.code(500).send({ ok: false, error: "Не вдалося отримати звіт від Python" });
        }

        writeFile(REPORT_PATH, JSON.stringify(result.report, null, 2), "utf8").catch(() => {});

        try {
            const plotBuf = await readFile(PLOT_PATH);
            return { ok: true, kResumes, kVacancies, ...result.report, plot: plotBuf.toString("base64") };
        } catch {
            return reply.code(500).send({ ok: false, error: "Не вдалося прочитати графік" });
        }
    });
}
