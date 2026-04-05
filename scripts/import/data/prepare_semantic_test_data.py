import json
import glob
import os

APP_DATA = r"E:\Диплом\programm\app\data"
RESUMES_DIR = r"/resumes"
VACANCIES_DIR = r"/vacances"

OUT_RESUMES = os.path.join(APP_DATA, "resumes_semantic_test.jsonl")
OUT_VACANCIES = os.path.join(APP_DATA, "vacancies_semantic_test.jsonl")

def load_mapping_ids(path):
    ids = set()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            ids.add(str(obj.get("document_id")))
    return ids

def extract_possible_id(obj):
    for key in ["id", "resume_id", "vacancy_id", "document_id", "cv_id", "_id"]:
        if key in obj and obj[key] is not None:
            return str(obj[key])
    return None

def filter_jsonl_files(source_dir, needed_ids, output_file):
    found_ids = set()
    written = 0
    files = glob.glob(os.path.join(source_dir, "**", "*.jsonl"), recursive=True)

    with open(output_file, "w", encoding="utf-8") as out:
        for file_path in files:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                        except Exception:
                            continue

                        if not isinstance(obj, dict):
                            continue

                        obj_id = extract_possible_id(obj)
                        if obj_id and obj_id in needed_ids and obj_id not in found_ids:
                            out.write(json.dumps(obj, ensure_ascii=False) + "\n")
                            found_ids.add(obj_id)
                            written += 1
            except Exception as e:
                print(f"[WARN] Не удалось прочитать {file_path}: {e}")

    return written, found_ids

def main():
    cv_map_file = os.path.join(APP_DATA, "cv_results_with_embeddings.jsonl")
    vac_map_file = os.path.join(APP_DATA, "vac_results_with_embeddings.jsonl")

    needed_resume_ids = load_mapping_ids(cv_map_file)
    needed_vacancy_ids = load_mapping_ids(vac_map_file)

    print(f"[INFO] Нужно резюме: {len(needed_resume_ids)}")
    print(f"[INFO] Нужно вакансий: {len(needed_vacancy_ids)}")

    resumes_written, found_resume_ids = filter_jsonl_files(
        RESUMES_DIR, needed_resume_ids, OUT_RESUMES
    )
    vacancies_written, found_vacancy_ids = filter_jsonl_files(
        VACANCIES_DIR, needed_vacancy_ids, OUT_VACANCIES
    )

    print(f"[OK] resumes_semantic_test.jsonl: {resumes_written} записей")
    print(f"[OK] vacancies_semantic_test.jsonl: {vacancies_written} записей")

    missing_resumes = needed_resume_ids - found_resume_ids
    missing_vacancies = needed_vacancy_ids - found_vacancy_ids

    if missing_resumes:
        print("[WARN] Не найдены резюме:", ", ".join(sorted(missing_resumes)))
    if missing_vacancies:
        print("[WARN] Не найдены вакансии:", ", ".join(sorted(missing_vacancies)))

if __name__ == "__main__":
    main()