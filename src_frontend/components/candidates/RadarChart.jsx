/**
 * Pure SVG radar chart — no external dependencies.
 * Compares up to 2 candidates across scoring criteria.
 */

const COLORS = [
    { stroke: "#2563eb", fill: "rgba(37,99,235,0.15)" },
    { stroke: "#16a34a", fill: "rgba(22,163,74,0.13)" },
];

function polarToXY(angle, r, cx, cy) {
    const rad = (angle - 90) * (Math.PI / 180);
    return {
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad),
    };
}

const AXIS_LABELS = {
    city_match: "City",
    region_match: "Region",
    salary_match: "Salary",
    experience_match: "Experience",
    employment_type_match: "Employment",
    language_match: "Language",
    title_similarity_match: "Title",
    keyword_match: "Keywords",
    education_match: "Education",
    recency_match: "Freshness",
    completeness_match: "Completeness",
    bool_match: "Attributes",
    skill_mapping_match: "ESCO Skills",
    semantic_skill_match: "Semantic Skills",
};

// Pick the most meaningful axes (max 8 for readability)
const PREFERRED_AXES = [
    "semantic_skill_match",
    "skill_mapping_match",
    "salary_match",
    "experience_match",
    "city_match",
    "language_match",
    "keyword_match",
    "title_similarity_match",
];

export default function RadarChart({ candidates }) {
    if (!candidates || candidates.length === 0) return null;

    // Collect axes from first candidate's details, prefer predefined order
    const allTypes = new Set();
    for (const c of candidates) {
        for (const d of (c.details || [])) allTypes.add(d.calc_type);
    }

    const axes = PREFERRED_AXES.filter(a => allTypes.has(a))
        .concat([...allTypes].filter(a => !PREFERRED_AXES.includes(a)))
        .slice(0, 8);

    if (axes.length < 3) return null;

    // Find max weighted_score per axis across all candidates for normalization
    const maxByAxis = {};
    for (const axis of axes) {
        let max = 0;
        for (const c of candidates) {
            const d = (c.details || []).find(x => x.calc_type === axis);
            if (d) max = Math.max(max, Number(d.weighted_score) || 0);
        }
        maxByAxis[axis] = max > 0 ? max : 1;
    }

    const SIZE = 320;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const R = 120;
    const levels = 4;
    const n = axes.length;

    // Grid rings
    const rings = Array.from({ length: levels }, (_, i) => (i + 1) / levels);

    // Axis endpoints
    const axisPoints = axes.map((_, i) => polarToXY((360 / n) * i, R, cx, cy));

    // Build polygon points for each candidate
    function getCandidatePoints(candidate) {
        return axes.map((axis, i) => {
            const detail = (candidate.details || []).find(d => d.calc_type === axis);
            const score = detail ? Number(detail.weighted_score) || 0 : 0;
            const norm = Math.min(score / maxByAxis[axis], 1);
            return polarToXY((360 / n) * i, norm * R, cx, cy);
        });
    }

    return (
        <div style={styles.wrapper}>
            <svg width={SIZE} height={SIZE} style={styles.svg}>
                {/* Grid rings */}
                {rings.map((r, ri) => {
                    const pts = axes.map((_, i) => {
                        const p = polarToXY((360 / n) * i, r * R, cx, cy);
                        return `${p.x},${p.y}`;
                    }).join(" ");
                    return <polygon key={ri} points={pts} fill="none" stroke="#e2e8f0" strokeWidth="1" />;
                })}

                {/* Axis lines */}
                {axisPoints.map((pt, i) => (
                    <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="#cbd5e1" strokeWidth="1" />
                ))}

                {/* Candidate polygons */}
                {candidates.map((c, ci) => {
                    const pts = getCandidatePoints(c);
                    const pointsStr = pts.map(p => `${p.x},${p.y}`).join(" ");
                    const color = COLORS[ci % COLORS.length];
                    return (
                        <g key={ci}>
                            <polygon points={pointsStr} fill={color.fill} stroke={color.stroke} strokeWidth="2" />
                            {pts.map((p, i) => (
                                <circle key={i} cx={p.x} cy={p.y} r="4" fill={color.stroke} />
                            ))}
                        </g>
                    );
                })}

                {/* Axis labels */}
                {axisPoints.map((pt, i) => {
                    const angle = (360 / n) * i;
                    const labelPt = polarToXY(angle, R + 22, cx, cy);
                    const anchor = labelPt.x < cx - 5 ? "end" : labelPt.x > cx + 5 ? "start" : "middle";
                    return (
                        <text
                            key={i}
                            x={labelPt.x}
                            y={labelPt.y}
                            textAnchor={anchor}
                            dominantBaseline="middle"
                            fontSize="11"
                            fill="#475569"
                            fontWeight="500"
                        >
                            {AXIS_LABELS[axes[i]] || axes[i]}
                        </text>
                    );
                })}
            </svg>

            {/* Legend */}
            <div style={styles.legend}>
                {candidates.map((c, ci) => {
                    const color = COLORS[ci % COLORS.length];
                    return (
                        <div key={ci} style={styles.legendItem}>
                            <span style={{ ...styles.legendDot, background: color.stroke }} />
                            <span>{c.candidate_name || `Candidate ${ci + 1}`}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const styles = {
    wrapper: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px"
    },
    svg: {
        overflow: "visible"
    },
    legend: {
        display: "flex",
        gap: "20px",
        flexWrap: "wrap",
        justifyContent: "center"
    },
    legendItem: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "13px",
        color: "#374151"
    },
    legendDot: {
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        flexShrink: 0
    }
};
