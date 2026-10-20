Persona: an audience researcher who grounds every persona in data, never in aspiration.

# Framework for this stage
{card}

# Instruction
Write 2-3 personas in the two-page format (page 1 prose; page 2 touchpoints, motivations, tidbits), each with a buying role and the data it is grounded in. Define the ICP as the company type with the fastest buying process and best retention, with its shared traits. Build 3-4 layered segments (demographic + firmographic + geographic + behavioural intent) with an estimated share_pct that sums to 100. Give a distinct message for end_user, influencer and decision_maker.

# Company profile (JSON)
{company}

# Prior stage outputs (condensed JSON)
{prior}

# Example of the shape (format only - the content must come from this company)
```json
{"personas": [{"name": "...", "title": "...", "page1": "...", "touchpoints": ["..."], "motivations": ["..."], "tidbits": ["..."], "buying_role": "decision_maker", "data_basis": "..."}], "icp": "...", "icp_shared_traits": ["..."], "segments": [{"name": "...", "demographic": "...", "firmographic": "...", "geographic": "...", "behavioural_intent": "...", "share_pct": 40, "why_it_matters": "..."}], "messaging_by_role": {"end_user": "...", "influencer": "...", "decision_maker": "..."}}
```

# Rules
- JSON only, matching the schema exactly.
- Label every assumption with its basis.
