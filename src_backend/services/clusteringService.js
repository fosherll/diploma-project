/**
 * K-means clustering of candidates by their averaged ESCO skill embeddings.
 * Pure JS implementation — no external libraries needed.
 */
import { nameCluster } from "./clusterNamingService.js";

function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}

function averageVectors(vectors) {
    if (!vectors.length) return null;
    const dim = vectors[0].length;
    const result = new Array(dim).fill(0);
    for (const v of vectors) {
        for (let i = 0; i < dim; i++) result[i] += v[i];
    }
    for (let i = 0; i < dim; i++) result[i] /= vectors.length;
    return result;
}

function kmeans(points, k, maxIter = 30) {
    if (points.length <= k) {
        return points.map((_, i) => i);
    }

    // Initialize centroids with k-means++ style (spread out)
    const centroids = [points[Math.floor(Math.random() * points.length)]];
    while (centroids.length < k) {
        const distances = points.map(p => {
            const minD = Math.min(...centroids.map(c => euclideanDistance(p, c)));
            return minD * minD;
        });
        const total = distances.reduce((a, b) => a + b, 0);
        let rand = Math.random() * total;
        for (let i = 0; i < points.length; i++) {
            rand -= distances[i];
            if (rand <= 0) {
                centroids.push(points[i]);
                break;
            }
        }
        if (centroids.length < k) centroids.push(points[points.length - 1]);
    }

    let assignments = new Array(points.length).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
        // Assign each point to nearest centroid
        const newAssignments = points.map(p => {
            let minDist = Infinity;
            let cluster = 0;
            for (let c = 0; c < centroids.length; c++) {
                const d = euclideanDistance(p, centroids[c]);
                if (d < minDist) { minDist = d; cluster = c; }
            }
            return cluster;
        });

        // Check convergence
        if (newAssignments.every((a, i) => a === assignments[i])) break;
        assignments = newAssignments;

        // Update centroids
        for (let c = 0; c < k; c++) {
            const clusterPoints = points.filter((_, i) => assignments[i] === c);
            if (clusterPoints.length > 0) {
                const avg = averageVectors(clusterPoints);
                centroids[c] = avg;
            }
        }
    }

    return assignments;
}

/**
 * @param {Object} client - pg client
 * @param {string} vacancyId
 * @param {string|null} runId
 * @param {number} limit - top N candidates to cluster
 * @param {number} k - number of clusters
 */
export async function clusterCandidates(client, vacancyId, runId, limit = 50, k = 3) {
    // Get top candidates from evaluations
    let evalQuery = `
        SELECT e.resume_id, e.total_score, r.candidate_name, r.city, r.title
        FROM evaluations e
        LEFT JOIN resumes r ON r.id = e.resume_id
        WHERE e.vacancy_id = $1
    `;
    const params = [String(vacancyId)];

    if (runId) {
        evalQuery += ` AND e.run_id = $2 ORDER BY e.total_score DESC LIMIT $3`;
        params.push(String(runId), limit);
    } else {
        evalQuery += ` AND e.run_id = (
            SELECT run_id FROM evaluations WHERE vacancy_id=$1
            GROUP BY run_id ORDER BY MAX(created_at) DESC LIMIT 1
        ) ORDER BY e.total_score DESC LIMIT $2`;
        params.push(limit);
    }

    const { rows: candidates } = await client.query(evalQuery, params);

    if (!candidates.length) return { clusters: [], k };

    // Get averaged skill embeddings per candidate
    const resumeIds = candidates.map(c => c.resume_id);
    const { rows: embRows } = await client.query(`
        SELECT m.document_id, m.esco_label, m.embedding::text
        FROM cv_skill_mappings m
        JOIN resume_mapping_links l ON l.mapping_document_id = m.document_id
        WHERE l.resume_id = ANY($1) AND m.embedding IS NOT NULL
    `, [resumeIds]);

    // Group embeddings by resume_id
    const embByResume = {};
    for (const row of embRows) {
        const resumeId = resumeIds.find(id => {
            // mapping_document_id matches resume_id via resume_mapping_links
            return true; // we'll match below
        });
    }

    // Build map: resume_id -> list of embeddings
    const { rows: linkRows } = await client.query(`
        SELECT resume_id, mapping_document_id FROM resume_mapping_links WHERE resume_id = ANY($1)
    `, [resumeIds]);

    const docIdToResumeId = {};
    for (const lr of linkRows) {
        docIdToResumeId[lr.mapping_document_id] = lr.resume_id;
    }

    const embeddingsByResume = {};
    for (const row of embRows) {
        const resumeId = docIdToResumeId[row.document_id];
        if (!resumeId) continue;
        if (!embeddingsByResume[resumeId]) embeddingsByResume[resumeId] = [];
        // Parse vector string "[0.1,0.2,...]"
        const vec = JSON.parse(row.embedding.replace(/^\[/, "[").replace(/\]$/, "]"));
        embeddingsByResume[resumeId].push(vec);
    }

    // Compute average embedding per candidate
    const candidatesWithVec = candidates.map(c => ({
        ...c,
        vector: embeddingsByResume[c.resume_id]
            ? averageVectors(embeddingsByResume[c.resume_id])
            : null,
        topSkills: [...new Set(
            (embRows
                .filter(r => docIdToResumeId[r.document_id] === c.resume_id)
                .map(r => r.esco_label)
            )
        )].slice(0, 3)
    }));

    const withVec = candidatesWithVec.filter(c => c.vector !== null);
    const withoutVec = candidatesWithVec.filter(c => c.vector === null);

    let clusters = [];

    if (withVec.length >= k) {
        const points = withVec.map(c => c.vector);
        const assignments = kmeans(points, k);

        // Build clusters
        const clusterMap = {};
        for (let i = 0; i < withVec.length; i++) {
            const clusterId = assignments[i];
            if (!clusterMap[clusterId]) clusterMap[clusterId] = [];
            clusterMap[clusterId].push(withVec[i]);
        }

        // Sort clusters by average score descending
        clusters = Object.values(clusterMap).sort((a, b) => {
            const avgA = a.reduce((s, c) => s + Number(c.total_score), 0) / a.length;
            const avgB = b.reduce((s, c) => s + Number(c.total_score), 0) / b.length;
            return avgB - avgA;
        });
    } else if (withVec.length > 0) {
        clusters = [withVec];
    }

    // Add "no data" cluster if needed
    if (withoutVec.length > 0) {
        clusters.push(withoutVec);
    }

    // Label clusters
    const clusterLabels = ["A", "B", "C", "D", "E"];
    const result = clusters.map((members, idx) => {
        const avgScore = members.reduce((s, c) => s + Number(c.total_score), 0) / members.length;
        const allSkills = members.flatMap(c => c.topSkills || []);
        const skillFreq = {};
        for (const s of allSkills) skillFreq[s] = (skillFreq[s] || 0) + 1;
        const topSkills = Object.entries(skillFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([s]) => s);

        const isNoData = members === withoutVec;
        return {
            _isNoData: isNoData,
            avgScore: Math.round(avgScore * 100) / 100,
            topSkills,
            members: members.map(c => ({
                resume_id: c.resume_id,
                candidate_name: c.candidate_name || "—",
                city: c.city || "—",
                total_score: Number(c.total_score),
                topSkills: c.topSkills || []
            }))
        };
    });

    // Name clusters (async, tries Gemini then falls back to local)
    await Promise.all(result.map(async cluster => {
        if (cluster._isNoData) {
            cluster.label = "No skills data";
        } else {
            cluster.label = await nameCluster(cluster.topSkills, cluster.avgScore);
        }
        delete cluster._isNoData;
    }));

    // Deduplicate cluster names — append (2), (3) if same name appears multiple times
    const nameCounts = {};
    for (const cluster of result) {
        nameCounts[cluster.label] = (nameCounts[cluster.label] || 0) + 1;
    }
    const nameUsed = {};
    for (const cluster of result) {
        if (nameCounts[cluster.label] > 1) {
            nameUsed[cluster.label] = (nameUsed[cluster.label] || 0) + 1;
            if (nameUsed[cluster.label] > 1) {
                cluster.label = `${cluster.label} (${nameUsed[cluster.label]})`;
            }
        }
    }

    return { clusters: result, k };
}
