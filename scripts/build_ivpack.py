"""Build the compact browser dataset used by IV Compare.

The source files remain untouched. This adapter keeps only the normalized
metadata and the two curve coordinates needed by the web interface.
"""

from __future__ import annotations

import csv
import gzip
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
NORMALIZED = WORKSPACE / "tmp" / "iv_normalization" / "normalized_small.json"
OUTDOOR = WORKSPACE / "tmp" / "iv_normalization" / "outdoor_processed.json"
POINTS = WORKSPACE / "outputs" / "iv-data-normalization-20260821" / "IV_curve_points.tsv"
PUBLIC_PACK = ROOT / "public" / "data" / "iv-compare-dowsil.ivpack"
OUTPUT_PACK = WORKSPACE / "outputs" / "iv-data-normalization-20260821" / "IV_Compare_DOWSIL.ivpack"


def keep(row: dict, fields: tuple[str, ...]) -> dict:
    return {field: row.get(field) for field in fields}


def rounded(value: str) -> float | None:
    if value == "":
        return None
    return round(float(value), 7)


def main() -> None:
    source = json.loads(NORMALIZED.read_text(encoding="utf-8"))
    outdoor = json.loads(OUTDOOR.read_text(encoding="utf-8"))

    samples = [
        keep(
            row,
            (
                "sample_uid",
                "batch_no_raw",
                "electrode",
                "encapsulation_date",
                "material_raw",
                "material_family",
                "sample_id_raw",
                "sample_label",
                "recipe_uid",
                "recipe_raw",
                "frame_raw",
                "ribbon_raw",
                "sample_comments",
                "assigned_test",
            ),
        )
        for row in source["samples"]
    ]
    recipes = [
        keep(
            row,
            (
                "recipe_uid",
                "recipe_raw",
                "laminator",
                "temperature_profile_C",
                "duration_profile_min",
                "duration_profile_s",
                "pressure_pairs_mbar",
                "pressure_values_mbar",
            ),
        )
        for row in source["recipes"]
    ]
    observations = [
        keep(
            row,
            (
                "observation_uid",
                "sample_uid",
                "test_type",
                "exposure_duration_numeric",
                "exposure_unit",
                "efficiency_pct",
                "jsc_mA_cm2",
                "voc_V",
                "ff_pct",
                "action_or_status",
                "comments",
                "data_quality_flag",
            ),
        )
        for row in source["inventory_observations"]
    ]
    observations.extend(
        {
            "observation_uid": row["outdoor_daily_uid"],
            "sample_uid": row["sample_uid"],
            "test_type": "Outdoor",
            "exposure_duration_numeric": row["exposure_days"],
            "exposure_unit": "days",
            "efficiency_pct": None,
            "jsc_mA_cm2": None,
            "voc_V": None,
            "ff_pct": None,
            "outdoor_pr_pct": row["performance_ratio_pct_median"],
            "outdoor_pmpp_W": row["pmpp_W_max"],
            "outdoor_irradiance_W_m2": row["irradiance_W_m2_max"],
            "action_or_status": "outdoor_daily_aggregate",
            "comments": row["aggregation_protocol"],
            "data_quality_flag": row["qa_flags"],
        }
        for row in outdoor["daily"]
    )
    files = [
        keep(
            row,
            (
                "file_uid",
                "source_file",
                "inferred_test_type",
                "inferred_exposure_duration",
                "inferred_exposure_unit",
                "material_family_inferred",
                "measurement_date",
                "sample_uid",
                "match_status",
                "match_score",
            ),
        )
        for row in source["iv_files"]
    ]
    measurements = [
        keep(
            row,
            (
                "measurement_uid",
                "file_uid",
                "sample_uid",
                "match_status",
                "sheet_name",
                "curve_series_index",
                "measurement_date",
                "measurement_time",
                "cell_area_cm2",
                "jsc_mA_cm2",
                "voc_V",
                "ff_pct",
                "efficiency_pct",
                "point_count",
                "qa_flags",
            ),
        )
        for row in source["iv_measurements"]
    ]

    curves: dict[str, dict[str, list[float | None]]] = {}
    with POINTS.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        for row in reader:
            curve = curves.setdefault(row["measurement_uid"], {"v": [], "j": []})
            curve["v"].append(rounded(row["voltage_V"]))
            curve["j"].append(rounded(row["generated_current_density_mA_cm2"]))

    report = {
        "samples": len(samples),
        "recipes": len(recipes),
        "observations": len(observations),
        "files": len(files),
        "measurements": len(measurements),
        "points": sum(len(curve["v"]) for curve in curves.values()),
        "matchedFiles": sum(row["match_status"].startswith("matched_") for row in files),
        "reviewFiles": sum(row["match_status"] in {"ambiguous", "unmatched"} for row in files),
    }
    dataset = {
        "schemaVersion": "1.1",
        "name": "DOWSIL PV-6326 — jeu IV et Outdoor normalisé",
        "generatedOn": "2026-08-21",
        "report": report,
        "samples": samples,
        "recipes": recipes,
        "observations": observations,
        "files": files,
        "measurements": measurements,
        "curves": curves,
    }

    PUBLIC_PACK.parent.mkdir(parents=True, exist_ok=True)
    with PUBLIC_PACK.open("wb") as raw:
        with gzip.GzipFile(filename="iv-compare-dowsil.json", mode="wb", fileobj=raw, mtime=0) as compressed:
            with compressed:
                payload = json.dumps(dataset, ensure_ascii=False, separators=(",", ":"))
                compressed.write(payload.encode("utf-8"))

    OUTPUT_PACK.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PUBLIC_PACK, OUTPUT_PACK)
    print(
        json.dumps(
            {
                "publicPack": str(PUBLIC_PACK),
                "outputPack": str(OUTPUT_PACK),
                "compressedBytes": PUBLIC_PACK.stat().st_size,
                "report": report,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
