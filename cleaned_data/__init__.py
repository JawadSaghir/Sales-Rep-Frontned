"""Rep-trainer data layer: cleaning, SQLite store, taxonomy clustering, exports."""

from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
SCORECARD_CSV = _ROOT / "data" / "raw_data" / "Performance Bot Scorecards-Grid view.csv"
DB_PATH = Path(__file__).resolve().parent / "rep_trainer.db"
PROFILES_DIR = Path(__file__).resolve().parent / "rep_profiles"
TAXONOMY_DIR = Path(__file__).resolve().parent / "taxonomies"

# Grade bands, ordered low → high. Index doubles as the ordinal rank.
GRADE_BANDS = ["weak", "needs_improvement", "developing", "good", "strong", "elite"]
