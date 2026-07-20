What gets embedded vs. what stays as plain metadata
Remember the JSON extraction output looks like this:
json{
  "transcript_id": "zoom_2024_11_15_randy_call",
  "customer_profile": {
    "estimated_age_range": "50-60",
    "business_type": "auto body shop"
  },
  "objections_raised": [
    {
      "type": "price",
      "quote": "That's more than I paid for my last agency, and that was a waste.",
      "intensity": "high",
      "rep_response_worked": "yes"
    }
  ]
}
Only ONE field gets embedded: the quote text.
Everything else (type, intensity, rep_response_worked, customer_profile) stays as plain structured metadata — never turned into a vector. It's used for filtering, not similarity search.
Why only the quote, not the whole JSON
If you embedded the entire JSON blob (including field names like "type": "price" and "intensity": "high"), the embedding would represent a mix of structure + content, which pollutes the similarity signal. Two objections with the exact same real customer language but different metadata (say, different transcript_id) would embed differently just because of the surrounding JSON noise — that's not what you want.
You want the embedding to capture ONLY the meaning of what the customer actually said. So you embed the quote text alone, cleanly.
What the actual row in your vector store looks like
python# One row = one objection turn
row = {
    "id": "turn_a3f9",
    "embedding": embed_text("That's more than I paid for my last agency, and that was a waste."),  # ← ONLY this gets vectorized
    
    # everything below is plain metadata, NOT embedded, just stored alongside
    "quote": "That's more than I paid for my last agency, and that was a waste.",
    "transcript_id": "zoom_2024_11_15_randy_call",
    "role": "customer",
    "objection_type": "price",
    "intensity": "high",
    "rep_response_worked": "yes",
    "customer_age_range": "50-60",
    "character_cluster_id": "cluster_burned_before_skeptic"
}
The actual code
pythonfrom openai import OpenAI  # or Gemini, whichever embedding model you use

client = OpenAI()

def embed_text(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return response.data[0].embedding

# Loop through your extracted JSON files
for json_file in extraction_files:
    data = json.loads(json_file.read_text())
    
    for objection in data["objections_raised"]:
        vector = embed_text(objection["quote"])  # ← embed ONLY the quote
        
        insert_into_vector_db(
            embedding=vector,              # the vector
            quote=objection["quote"],       # metadata (for display)
            objection_type=objection["type"],       # metadata (for filtering)
            intensity=objection["intensity"],       # metadata (for filtering)
            rep_response_worked=objection["rep_response_worked"],  # metadata
            transcript_id=data["transcript_id"],    # metadata
            cluster_id=None  # filled in later, after clustering step
        )
Why this design is correct — the two-part query at runtime
This is exactly why we separated "embed the quote" from "store the rest as metadata" — it's what makes your retrieval query work:
sqlSELECT quote, rep_response_worked
FROM labeled_turns
WHERE objection_type = 'price'          -- ← filters on METADATA (not embedded)
  AND character_cluster_id = 'randy'    -- ← filters on METADATA (not embedded)
  AND rep_response_worked = 'yes'       -- ← filters on METADATA (not embedded)
ORDER BY embedding <=> $current_quote_embedding   -- ← ranks by the EMBEDDED quote only
LIMIT 3;
Metadata fields let you FILTER precisely ("only price objections, only Randy's cluster, only ones that worked"). The embedded quote lets you RANK by similarity within that filtered set. You need both, and they only work correctly if you keep them separate.
What would break if you embedded the whole JSON instead
If you embedded the full JSON object as one big text blob:

❌ You couldn't filter cleanly — similarity search would mix "similar meaning" with "similar JSON structure," giving worse matches
❌ You'd waste embedding-model context on field names and formatting instead of actual customer language
❌ Two identical quotes with different intensity values would embed as different vectors, even though the actual objection content is the same — that's wrong

The one-line answer
Only the quote field gets embedded — that's the actual customer language. Everything else in the JSON (objection_type, intensity, cluster_id, etc.) stays as plain structured metadata used for filtering, not vectorized. That split is what makes "filter first, then rank by similarity" possible.