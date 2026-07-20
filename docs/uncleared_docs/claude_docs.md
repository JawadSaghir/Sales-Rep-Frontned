The coverage analysis just answered your core question ("what's unnecessary?") with hard numbers. The headline finding:

★ Insight ─────────────────────────────────────
Found your 81 MB culprit: scoring_raw_json averages 12,174 chars × 3,967 rows ≈ 48 MB — one column is ~60% of the entire file. It's the raw LLM dump. Drop it and the file shrinks dramatically.

Confirmed their two-rubric split via coverage: the numeric scores you'd want to trend are sparse — objection_handling/close_mechanics/frame_and_control/prospect_read exist on only 44% of rows, total_score/grade on 59%, and coachability_signal on just 13%. The rich free-text fields (what_to_improve, why_no_close, coaching_tip, rudys_note) are on ~100%. → The narrative synthesis is your backbone; numeric trends are a supporting layer computed only over the scored subset.
─────────────────────────────────────────────────

I now have enough to present the design. I'll do it in two approval gates. Here's Part 1 — scope, field taxonomy (the "what to include" answer), and the cleaning pipeline.

---
Part 1A — Scope & Artifact

In scope: One markdown weakness profile per rep (~194 reps, filtered to those with enough scored calls), built from Performance Bot Scorecards-Grid view.csv. Hybrid: deterministic stats + LLM theme synthesis.

Out of scope (separate task): Prospect personas and the objection/escalation library for the voice agent. However, I'll fold which objection types each rep fumbles into their profile (from objections_surfaced + objection_handling score), because that's the bridge between "rep weakness" and "which prospect to drill them against."

Part 1B — Field Taxonomy: what to include

① INCLUDE — Weakness signal (the core, ~100% coverage):
what_to_improve · why_no_close · red_flags · coaching_tip · Rep Improvement Suggestions (AI) · what_id_polish · rudys_note (human coach synthesis) · one_line_verdict

② INCLUDE — Strengths (for balance, so training is targeted not demoralizing):
biggest_strength · what_went_well · what_made_this_close_work

③ INCLUDE — Numeric dimensions (scored subset only, flag sparsity):
total_score · grade (normalized) · objection_handling · did_rep_ask_for_close (→ close-ask rate) · close_mechanics · frame_and_control · prospect_read · self_assessment_accuracy

④ INCLUDE — Objection linkage & context:
objections_surfaced · intended_outcome · deal_outcome_context · Flagged For Follow-Up (AI)

⑤ INCLUDE — Identity/traceability (metadata, not analyzed):
rep_name  client_name · meeting_title · show_name 

⑥ EXCLUDE — Unnecessary (plumbing / bloat / near-empty):
scoring_raw_json (48 MB bloat) · grading_trace (audit dump) · source_airtable_record_id/created_time/ingested_at/processing_status · model_version · meeting_link · meeting_transcript_link · rep_pdf_link · Meeting Transcript · minutes (0.1%) · skip_reason/error_details (0%) · coachability_signal (13% — too sparse to trend) · scorecard_key/automation_key

Part 1C — Cleaning Pipeline (before any profiling)

1. Filter non-calls: drop rows where no_show=true, call_status indicates skipped/error, or both grade and total_score are empty AND all free-text is empty. (~1,628 ungraded rows triaged, not blindly deleted.)
2. Normalize grade: unify the two rubrics onto one scale. Map letter grades and qualitative labels (Elite/Strong/Developing/Needs Improvement) to a common 0–4 or 0–100 band; fix the 3 Unicode-minus variants; quarantine junk values ("D (context-adjusted…)") into a raw field rather than the normalized one.
3. Group by rep (normalize rep_name + Rep Email for spelling/casing collisions across 194 names).
4. Min-calls threshold: reps with too few scored calls get a "thin data" profile (stats suppressed, narrative only) rather than misleading averages.

---

