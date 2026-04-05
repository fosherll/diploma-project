
import argparse
import json
import sys
from pathlib import Path

from sentence_transformers import SentenceTransformer


MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def save_jsonl(rows: list[dict], path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def collect_labels(rows: list[dict]) -> list[str]:
    """Збирає всі унікальні esco_label зі всіх маппінгів."""
    labels = set()
    for row in rows:
        for section in ("direct_mappings", "graph_mappings"):
            for item in row.get(section, []):
                label = item.get("esco_label")
                if label:
                    labels.add(label.strip())
    return list(labels)


def add_embeddings(rows: list[dict], label_to_vec: dict[str, list[float]]) -> list[dict]:
    """Додає поле embedding до кожного маппінгу."""
    for row in rows:
        for section in ("direct_mappings", "graph_mappings"):
            for item in row.get(section, []):
                label = (item.get("esco_label") or "").strip()
                if label in label_to_vec:
                    item["embedding"] = label_to_vec[label]
    return rows


def main():
    parser = argparse.ArgumentParser(description="Add embeddings to skill mapping JSONL files")
    parser.add_argument("--input-cv", required=True, help="Path to cv_results_weight_llm_two_stage.jsonl")
    parser.add_argument("--input-vac", required=True, help="Path to vac_results_weight_llm_two_stage.jsonl")
    parser.add_argument("--output-dir", default="data", help="Directory to save output files")
    parser.add_argument("--model", default=MODEL_NAME, help="Sentence-transformers model name")
    args = parser.parse_args()

    cv_path = Path(args.input_cv)
    vac_path = Path(args.input_vac)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[load] CV: {cv_path}")
    cv_rows = load_jsonl(cv_path)
    print(f"[load] Vac: {vac_path}")
    vac_rows = load_jsonl(vac_path)

    # Збираємо всі унікальні мітки для батч-кодування
    all_labels = list(set(collect_labels(cv_rows) + collect_labels(vac_rows)))
    print(f"[encode] unique labels: {len(all_labels)}")

    print(f"[model] loading: {args.model}")
    model = SentenceTransformer(args.model)

    # Кодуємо всі мітки одним батчем — ефективно
    vectors = model.encode(all_labels, batch_size=64, show_progress_bar=True, normalize_embeddings=True)
    label_to_vec = {label: vec.tolist() for label, vec in zip(all_labels, vectors)}
    print(f"[encode] done, vector dim: {len(next(iter(label_to_vec.values())))}")

    cv_out = out_dir / "cv_results_with_embeddings.jsonl"
    vac_out = out_dir / "vac_results_with_embeddings.jsonl"

    cv_rows = add_embeddings(cv_rows, label_to_vec)
    save_jsonl(cv_rows, cv_out)
    print(f"[save] {cv_out}")

    vac_rows = add_embeddings(vac_rows, label_to_vec)
    save_jsonl(vac_rows, vac_out)
    print(f"[save] {vac_out}")

    print("[done] embeddings added successfully")


if __name__ == "__main__":
    main()