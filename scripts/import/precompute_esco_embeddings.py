
import argparse
import csv
import json
from pathlib import Path

from sentence_transformers import SentenceTransformer


MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--esco-csv", required=True, help="Path to ESCO skills CSV (Ukrainian)")
    parser.add_argument("--output", default="data/esco_embeddings.jsonl")
    parser.add_argument("--model", default=MODEL_NAME)
    args = parser.parse_args()

    csv_path = Path(args.esco_csv)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[load] Reading ESCO CSV: {csv_path}")
    rows = []
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            uri = row.get("conceptUri") or row.get("uri") or ""
            label = row.get("preferredLabel") or row.get("preferred_label") or ""
            group = row.get("skillType") or row.get("skill_type") or ""
            if uri and label:
                rows.append({"esco_uri": uri, "esco_label": label.strip(), "semantic_group": group})

    print(f"[load] loaded {len(rows)} ESCO skills")

    print(f"[model] loading: {args.model}")
    model = SentenceTransformer(args.model)

    labels = [r["esco_label"] for r in rows]
    vectors = model.encode(labels, batch_size=128, show_progress_bar=True, normalize_embeddings=True)

    print(f"[save] writing to {out_path}")
    with open(out_path, "w", encoding="utf-8") as f:
        for row, vec in zip(rows, vectors):
            record = {
                "esco_uri": row["esco_uri"],
                "esco_label": row["esco_label"],
                "semantic_group": row["semantic_group"],
                "model_name": args.model,
                "embedding": vec.tolist(),
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"[done] {len(rows)} embeddings saved")


if __name__ == "__main__":
    main()