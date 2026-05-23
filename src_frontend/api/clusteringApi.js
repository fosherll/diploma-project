import { apiFetch } from "./client.js";

export function runClustering(kResumes, kVacancies) {
    return apiFetch("/clustering/run", {
        method: "POST",
        body: JSON.stringify({ kResumes, kVacancies })
    });
}

export function buildClusterPlot(kResumes, kVacancies) {
    return apiFetch("/clustering/plot", {
        method: "POST",
        body: JSON.stringify({ kResumes, kVacancies })
    });
}

export function getClusterResults() {
    return apiFetch("/clustering/results");
}
