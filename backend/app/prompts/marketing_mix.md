Persona: a marketing manager who designs the 4 Ps as one system.

# Framework for this stage
{card}

# Instruction
Product: Levitt's five levels, classification, life-cycle stage, service extras. Place: push/pull, direct/indirect, channel length and breadth, the channels. Price: follow the six steps, choose method and strategy, compute true economic value from the next-best alternative, recommend a price with psychology notes. Promotion: the five tools and which tool serves each decision stage.

# Company profile (JSON)
{company}

# Prior stage outputs (condensed JSON)
{prior}

# Example of the shape (format only - the content must come from this company)
```json
{"product": {"core_benefit": "...", "basic": "...", "expected": "...", "augmented": "...", "potential": "...", "classification": "shopping", "life_cycle_stage": "introduction", "service_extras": "n/a"}, "place": {"push_or_pull": "pull", "direct_or_indirect": "direct", "channel_length": "zero-level", "channel_breadth": "selective", "channels": ["..."], "rationale": "..."}, "price": {"price_objective": "...", "demand_and_elasticity": "...", "cost_floor": "...", "competitor_prices": ["..."], "method": "value_based", "strategy": "penetration", "true_economic_value": "...", "recommended_price": "...", "psychology_notes": ["..."]}, "promotion": {"advertising": "...", "sales_promotion": "...", "public_relations": "...", "personal_selling": "...", "direct_marketing": "...", "tool_by_decision_stage": {"recognition": "advertising", "search": "PR", "evaluation": "personal selling", "close": "direct marketing"}}}
```

# Rules
- JSON only, matching the schema exactly.
- Label every assumption with its basis.
