"""
Кластеризація резюме та вакансій за ESCO навичками.

1. Завантажує агреговані ембединги з БД (середнє по навичках документа)
2. K-Means кластеризація резюме і вакансій окремо
3. Для кожного кластеру — топ-5 ESCO навичок
4. t-SNE візуалізація (scatter plot PNG)
5. Зберігає: cluster_report.json + cluster_plot.png

Run:
    python cluster_skills.py
    python cluster_skills.py --k-resumes 8 --k-vacancies 12
    python cluster_skills.py --no-plot
"""

import argparse
import json
import numpy as np
import psycopg2
import psycopg2.extras
from collections import Counter
from sklearn.cluster import KMeans
from sklearn.manifold import TSNE

DATABASE_URL  = "postgres://diploma:diploma@localhost:5432/diploma_db"
K_RESUMES     = 10
K_VACANCIES   = 15
MIN_CONF      = 0.62
# Максимальна вибірка документів для кластеризації (вистачає для якісного кластеризування)
MAX_RESUMES   = 2000
MAX_VACANCIES = 5000


def parse_vec(v):
    if v is None:
        return None
    if isinstance(v, list):
        return np.array(v, dtype=np.float32)
    if isinstance(v, str):
        return np.array([float(x) for x in v.strip("[]").split(",")], dtype=np.float32)
    return None


def load_document_vectors(conn, skill_table, link_table, id_col, max_docs=None):
    """
    Для кожного документа рахує середній вектор по ESCO навичках.
    Агрегація top-labels відбувається через окремий легкий запит.
    Повертає (ids, matrix, top_labels_map).
    """
    # 1. Отримуємо список doc_id (з обмеженням для великих таблиць)
    limit_clause = f"LIMIT {max_docs}" if max_docs else ""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT doc_id FROM (
                SELECT DISTINCT l.{id_col} AS doc_id
                FROM {link_table} l
                JOIN {skill_table} m ON m.document_id = l.mapping_document_id
                WHERE m.embedding IS NOT NULL
                  AND m.esco_label IS NOT NULL
                  AND m.confidence >= %s
            ) sub
            ORDER BY RANDOM()
            {limit_clause}
        """, (MIN_CONF,))
        doc_ids = [str(r[0]) for r in cur.fetchall()]

    if not doc_ids:
        return [], np.array([], dtype=np.float32), {}

    # 2. Завантажуємо embedding рядки тільки для відібраних документів
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(f"""
            SELECT l.{id_col} AS doc_id,
                   m.esco_label,
                   m.embedding::text AS emb_text
            FROM {link_table} l
            JOIN {skill_table} m ON m.document_id = l.mapping_document_id
            WHERE l.{id_col} = ANY(%s)
              AND m.embedding IS NOT NULL
              AND m.esco_label IS NOT NULL
              AND m.confidence >= %s
        """, (doc_ids, MIN_CONF))
        rows = cur.fetchall()

    doc_vecs_raw   = {}
    doc_label_raw  = {}
    for row in rows:
        did = str(row["doc_id"])
        vec = parse_vec(row["emb_text"])
        if vec is None:
            continue
        doc_vecs_raw.setdefault(did, []).append(vec)
        doc_label_raw.setdefault(did, []).append(row["esco_label"])

    ids, matrix, top_labels = [], [], {}
    for did, vecs in doc_vecs_raw.items():
        avg = np.mean(vecs, axis=0).astype(np.float32)
        norm = np.linalg.norm(avg)
        if norm > 0:
            avg /= norm
        ids.append(did)
        matrix.append(avg)
        top_labels[did] = [lbl for lbl, _ in Counter(doc_label_raw[did]).most_common(3)]

    return ids, np.array(matrix, dtype=np.float32), top_labels


SKILL_CATEGORIES = [
    ("IT / Розробка",        ["програмування","software","python","javascript","java","sql","web","api","linux","git","react","node","розробк","frontend","backend","devops","cloud"]),
    ("Управління / Менеджмент", ["управління","менеджмент","керівництво","планування","організація","leadership","manage","стратегічн","координац"]),
    ("Фінанси / Бухгалтерія",  ["бухгалтер","фінанс","облік","податк","звітність","баланс","audit","excel","1с","erp"]),
    ("Продажі / Маркетинг",    ["продаж","маркетинг","клієнт","реклама","crm","переговори","sales","мерчендайзинг","аргументац"]),
    ("Дизайн / Творчість",     ["дизайн","графіка","photoshop","illustrator","ui","ux","adobe","творч","анімац","відео"]),
    ("Логістика / Склад",      ["логістика","склад","транспорт","доставка","вантаж","складськ","інвентар","митн"]),
    ("Медицина / Охорона здоров'я", ["медицин","лікар","медсестр","фармацевт","здоров","клінічн","догляд","терапі"]),
    ("HR / Навчання",          ["персонал","рекрутинг","навчання","hr","кадри","підбір","тренінг","розвиток персонал"]),
    ("Інженерія / Виробництво",["інженер","технічн","проектування","autocad","механік","електрик","виробнич","обладнан","ремонт"]),
    ("Автомобілі / Транспорт", ["автомобіл","водій","керуванн","діагностик","двигун","транспортн","паркуванн"]),
    ("Тварини / Сільське господарство", ["тварин","худоб","ветеринар","сільськ","рослинництв","агро","ферм"]),
    ("Юриспруденція / Право",  ["юридичн","право","законодавств","договір","суд","правов","нормативн"]),
    ("Комунікація / М'які навички", ["спілкування","відповідальн","комунікац","командн","стресостійк","наполегливіст","адаптивн"]),
    ("Торгівля / Роздріб",     ["торгівл","роздрібн","характеристика продукц","мерчендайзинг","касир","магазин"]),
]

def _name_cluster_by_skills(top_skills: list[str]) -> str:
    """Визначає назву кластеру за топ-навичками через категорії."""
    if not top_skills:
        return "Загальний кластер"
    text = " ".join(top_skills).lower()
    best_cat, best_score = None, 0
    for cat_name, keywords in SKILL_CATEGORIES:
        score = sum(1 for kw in keywords if kw in text)
        if score > best_score:
            best_score, best_cat = score, cat_name
    return best_cat if best_cat and best_score > 0 else "Змішані навички"


def cluster_and_describe(ids, matrix, k, top_labels_map):
    """K-Means → мітки + опис кожного кластеру."""
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(matrix)

    buckets = {}
    for did, cl in zip(ids, labels):
        buckets.setdefault(int(cl), []).extend(top_labels_map.get(did, []))

    clusters = []
    for cl in sorted(buckets):
        top = [s for s, _ in Counter(buckets[cl]).most_common(5)]
        clusters.append({
            "cluster":    cl,
            "size":       int(np.sum(labels == cl)),
            "top_skills": top,
            "name":       _name_cluster_by_skills(top),
        })
    return labels, clusters


def _stratified_sample(labels, min_per_cluster=25, max_total=2000):
    """Стратифікований відбір: кожен кластер гарантовано присутній у вибірці.

    Бере не менше min_per_cluster точок з кожного кластера (або всі якщо менше),
    потім випадково скорочує до max_total якщо загальна кількість перевищує ліміт.
    """
    unique_cls = np.unique(labels)
    selected = []
    for cl in unique_cls:
        cl_idx = np.where(labels == cl)[0]
        # мінімум min_per_cluster або 30% кластера — що більше
        n = min(max(min_per_cluster, len(cl_idx) // 3), len(cl_idx))
        chosen = np.random.choice(cl_idx, n, replace=False)
        selected.extend(chosen.tolist())
    arr = np.array(selected)
    if len(arr) > max_total:
        arr = np.random.choice(arr, max_total, replace=False)
    return arr


def _nudge_labels(positions, min_dist=12.0, iterations=150):
    """Ітеративно розсуває мітки що перекриваються.

    Якщо дві мітки ближче ніж min_dist — штовхаємо їх одна від одної.
    Зупиняється достроково якщо жодна мітка не рухалась.
    """
    pos = np.array(positions, dtype=float)
    if len(pos) < 2:
        return pos.tolist()
    for _ in range(iterations):
        moved = False
        for i in range(len(pos)):
            for j in range(i + 1, len(pos)):
                diff = pos[i] - pos[j]
                dist = np.linalg.norm(diff)
                if 0 < dist < min_dist:
                    push = diff / dist * (min_dist - dist) * 0.5
                    pos[i] += push
                    pos[j] -= push
                    moved = True
        if not moved:
            break
    return pos.tolist()


def build_plot(res_matrix, res_labels, vac_matrix, vac_labels, out_path,
               res_clusters=None, vac_clusters=None):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches

    # Стратифікований відбір — кожен кластер гарантовано представлений.
    # Ліміти підібрані щоб t-SNE вкладалось у ~2 хв (сервер вбиває на 7 хв).
    idx_r = _stratified_sample(res_labels, min_per_cluster=20, max_total=700)
    idx_v = _stratified_sample(vac_labels, min_per_cluster=25, max_total=1300)
    max_r, max_v = len(idx_r), len(idx_v)

    combined = np.vstack([res_matrix[idx_r], vac_matrix[idx_v]])
    print(f"  t-SNE: {max_r} резюме + {max_v} вакансій (~2 хв)...", flush=True)
    coords = TSNE(n_components=2, perplexity=30, random_state=42,
                  max_iter=500).fit_transform(combined)

    rc = coords[:max_r]
    vc = coords[max_r:]
    res_cl_sub = res_labels[idx_r]
    vac_cl_sub = vac_labels[idx_v]

    res_unique = sorted(set(res_cl_sub.tolist()))
    vac_unique = sorted(set(vac_cl_sub.tolist()))

    RES_COLORS = ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd",
                  "#1e40af", "#1e3a8a", "#172554", "#0284c7", "#0369a1"]
    VAC_COLORS = ["#9ca3af", "#6b7280", "#4b5563", "#374151", "#d1d5db",
                  "#e5e7eb", "#b0b7c0", "#8b96a5", "#c8cdd4", "#a0a9b5"]

    fig, ax = plt.subplots(figsize=(16, 11))

    # Вакансії (квадрати, сірі)
    for i, cl in enumerate(vac_unique):
        mask = vac_cl_sub == cl
        ax.scatter(vc[mask, 0], vc[mask, 1],
                   color=VAC_COLORS[i % len(VAC_COLORS)],
                   alpha=0.35, s=14, marker="s")

    # Резюме (кола, сині)
    for i, cl in enumerate(res_unique):
        mask = res_cl_sub == cl
        ax.scatter(rc[mask, 0], rc[mask, 1],
                   color=RES_COLORS[i % len(RES_COLORS)],
                   alpha=0.85, s=50, marker="o")

    # ── Збираємо центроїди резюме + вакансій разом для розумного розміщення ──
    centroids_xy  = []   # вихідні центроїди (куди вказуватиме стрілка)
    label_init_xy = []   # початкові позиції міток (= центроїди, потім розсунемо)
    label_texts   = []
    label_colors  = []

    if res_clusters:
        res_info = {c["cluster"]: c for c in res_clusters}
        for cl in res_unique:
            mask = res_cl_sub == cl
            if mask.any() and cl in res_info:
                cx = float(rc[mask, 0].mean())
                cy = float(rc[mask, 1].mean())
                centroids_xy.append((cx, cy))
                label_init_xy.append([cx, cy])
                label_texts.append(res_info[cl]["name"])
                label_colors.append("#1e3a8a")   # темно-синій для резюме

    if vac_clusters:
        vac_info = {c["cluster"]: c for c in vac_clusters}
        for cl in vac_unique:
            mask = vac_cl_sub == cl
            if mask.any() and cl in vac_info:
                cx = float(vc[mask, 0].mean())
                cy = float(vc[mask, 1].mean())
                centroids_xy.append((cx, cy))
                label_init_xy.append([cx, cy])
                label_texts.append(vac_info[cl]["name"])
                label_colors.append("#374151")   # темно-сірий для вакансій

    # Розсуваємо перекриття між усіма мітками
    nudged_xy = _nudge_labels(label_init_xy, min_dist=14.0, iterations=150)

    for (nx, ny), (ox, oy), text, color in zip(nudged_xy, centroids_xy, label_texts, label_colors):
        displaced = bool(np.hypot(nx - ox, ny - oy) > 2.0)
        ax.annotate(
            text,
            xy=(ox, oy), xytext=(nx, ny),
            fontsize=7, ha="center", va="center", fontweight="bold",
            color=color,
            bbox=dict(boxstyle="round,pad=0.3", fc="white", alpha=0.82, ec="none"),
            arrowprops=dict(arrowstyle="-", color="#aaa", lw=0.8, alpha=0.7) if displaced else None,
            zorder=6,
        )

    ax.set_title("Кластеризація резюме та вакансій за ESCO навичками (t-SNE)", fontsize=13)
    ax.legend(handles=[
        mpatches.Patch(color="#2563eb", label=f"Резюме ({max_r} з {len(res_matrix)})"),
        mpatches.Patch(color="#9ca3af", label=f"Вакансії ({max_v} з {len(vac_matrix)})")
    ], loc="upper right", fontsize=10)
    ax.axis("off")
    plt.tight_layout()
    plt.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Збережено: {out_path}")

    if res_clusters and vac_clusters:
        _build_interactive_plot(
            rc, vc, res_cl_sub, vac_cl_sub,
            res_clusters, vac_clusters,
            out_path.replace(".png", ".html"),
        )


def _build_interactive_plot(rc, vc, res_cl, vac_cl,
                             res_clusters, vac_clusters, html_path):
    try:
        import plotly.graph_objects as go
    except ImportError:
        print("  [skip] plotly не встановлено (pip install plotly) — HTML не створено")
        return

    res_info = {c["cluster"]: c for c in res_clusters}
    vac_info = {c["cluster"]: c for c in vac_clusters}

    def _hover_res(cl):
        info = res_info.get(cl, {})
        skills = "<br>".join(info.get("top_skills", [])[:3]) or "—"
        return f"<b>{info.get('name', cl)}</b><br>{skills}"

    def _hover_vac(cl):
        info = vac_info.get(cl, {})
        skills = "<br>".join(info.get("top_skills", [])[:3]) or "—"
        return f"<b>{info.get('name', cl)}</b><br>{skills}"

    fig = go.Figure()

    # Вакансії (квадрати, сірі)
    fig.add_trace(go.Scatter(
        x=vc[:, 0], y=vc[:, 1],
        mode="markers",
        marker=dict(symbol="square", size=5, color=vac_cl.tolist(),
                    colorscale="Greys", opacity=0.35, showscale=False),
        text=[_hover_vac(cl) for cl in vac_cl],
        hovertemplate="%{text}<extra>Вакансія</extra>",
        name="Вакансії",
    ))

    # Резюме (кола, сині)
    fig.add_trace(go.Scatter(
        x=rc[:, 0], y=rc[:, 1],
        mode="markers",
        marker=dict(symbol="circle", size=7, color=res_cl.tolist(),
                    colorscale="Blues", opacity=0.85, showscale=False),
        text=[_hover_res(cl) for cl in res_cl],
        hovertemplate="%{text}<extra>Резюме</extra>",
        name="Резюме",
    ))

    # ── Анотації з тими самими nudged позиціями ──
    all_centroids   = []
    all_label_pos   = []
    all_texts       = []
    all_font_colors = []

    for cl_info in res_clusters:
        cl = cl_info["cluster"]
        mask = res_cl == cl
        if not mask.any():
            continue
        cx, cy = float(rc[mask, 0].mean()), float(rc[mask, 1].mean())
        all_centroids.append([cx, cy])
        all_label_pos.append([cx, cy])
        all_texts.append(cl_info["name"])
        all_font_colors.append("#1e3a8a")

    for cl_info in vac_clusters:
        cl = cl_info["cluster"]
        mask = vac_cl == cl
        if not mask.any():
            continue
        cx, cy = float(vc[mask, 0].mean()), float(vc[mask, 1].mean())
        all_centroids.append([cx, cy])
        all_label_pos.append([cx, cy])
        all_texts.append(cl_info["name"])
        all_font_colors.append("#374151")

    nudged = _nudge_labels(all_label_pos, min_dist=14.0, iterations=150)

    for (nx, ny), (ox, oy), text, fcolor in zip(nudged, all_centroids, all_texts, all_font_colors):
        displaced = bool(np.hypot(nx - ox, ny - oy) > 2.0)
        fig.add_annotation(
            x=nx, y=ny,
            ax=ox if displaced else nx,
            ay=oy if displaced else ny,
            xref="x", yref="y", axref="x", ayref="y",
            text=f"<b>{text}</b>",
            showarrow=displaced,
            arrowcolor="#bbb", arrowwidth=1, arrowhead=0,
            font=dict(size=9, color=fcolor),
            bgcolor="rgba(255,255,255,0.82)",
            borderpad=3,
        )

    fig.update_layout(
        title=dict(text="Кластеризація резюме та вакансій за ESCO навичками (t-SNE)",
                   font=dict(size=14)),
        xaxis=dict(showticklabels=False, showgrid=False, zeroline=False),
        yaxis=dict(showticklabels=False, showgrid=False, zeroline=False),
        hovermode="closest",
        legend=dict(orientation="h", yanchor="bottom", y=1.01, xanchor="right", x=1),
        width=1300, height=880,
        plot_bgcolor="white", paper_bgcolor="white",
    )

    fig.write_html(html_path, include_plotlyjs="cdn")
    print(f"  Збережено: {html_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--k-resumes",   type=int, default=K_RESUMES)
    parser.add_argument("--k-vacancies", type=int, default=K_VACANCIES)
    parser.add_argument("--no-plot",     action="store_true",
                        help="Пропустити побудову t-SNE графіку")
    args = parser.parse_args()

    print("=" * 60)
    print("  КЛАСТЕРИЗАЦІЯ РЕЗЮМЕ ТА ВАКАНСІЙ")
    print("=" * 60)

    conn = psycopg2.connect(DATABASE_URL)

    print("\n[1] Завантаження векторів резюме...")
    res_ids, res_mat, res_top = load_document_vectors(
        conn, "cv_skill_mappings", "resume_mapping_links", "resume_id", MAX_RESUMES
    )
    print(f"    {len(res_ids)} резюме завантажено")

    print("\n[2] Завантаження векторів вакансій...")
    vac_ids, vac_mat, vac_top = load_document_vectors(
        conn, "vac_skill_mappings", "vacancy_mapping_links", "vacancy_id", MAX_VACANCIES
    )
    print(f"    {len(vac_ids)} вакансій завантажено")
    conn.close()

    print(f"\n[3] K-Means резюме  (K={args.k_resumes})...")
    res_labels, res_clusters = cluster_and_describe(
        res_ids, res_mat, args.k_resumes, res_top
    )

    print(f"\n[4] K-Means вакансії (K={args.k_vacancies})...")
    vac_labels, vac_clusters = cluster_and_describe(
        vac_ids, vac_mat, args.k_vacancies, vac_top
    )

    print("\n" + "=" * 60)
    print("  КЛАСТЕРИ РЕЗЮМЕ")
    print("=" * 60)
    for cl in res_clusters:
        skills = ", ".join(cl["top_skills"]) or "—"
        print(f"  [{cl['cluster']:>2}] {cl['size']:>4} резюме   | {skills}")

    print("\n" + "=" * 60)
    print("  КЛАСТЕРИ ВАКАНСІЙ")
    print("=" * 60)
    for cl in vac_clusters:
        skills = ", ".join(cl["top_skills"]) or "—"
        print(f"  [{cl['cluster']:>2}] {cl['size']:>5} вакансій | {skills}")

    report = {"resume_clusters": res_clusters, "vacancy_clusters": vac_clusters}

    # Виводимо JSON у stderr з маркером — Node.js зчитає звідти (без запису файлу!)
    import sys
    sys.stderr.write("__CLUSTER_REPORT__:" + json.dumps(report, ensure_ascii=False) + "\n")
    sys.stderr.flush()
    print("\n  Звіт передано через stderr")

    if not args.no_plot:
        print("\n[5] Побудова t-SNE графіку...")
        build_plot(res_mat, res_labels, vac_mat, vac_labels, "cluster_plot.png",
                   res_clusters=res_clusters, vac_clusters=vac_clusters)

    print("\n[done]")


if __name__ == "__main__":
    main()
