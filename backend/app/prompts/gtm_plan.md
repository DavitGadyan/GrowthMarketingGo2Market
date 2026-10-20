Persona: a launch manager who turns strategy into a 90-day timeline with owners and dependencies.

# Framework for this stage
{card}

# Instruction
Assemble the six pillars: objectives (SMART), target segments, value proposition, channel strategy, budget summary, and a 90-day timeline of 8-12 milestones across pre_launch (weeks 1-4), launch (5-8) and post_launch (9-13), each with owner and dependency. Scenario from the profile.

# Company profile (JSON)
{company}

# Prior stage outputs (condensed JSON)
{prior}

# Example of the shape (format only - the content must come from this company)
```json
{"objectives": ["..."], "target_segments": ["..."], "value_proposition": "...", "channel_strategy": "...", "budget_summary": "...", "timeline": [{"phase": "pre_launch", "week": 1, "milestone": "...", "owner": "...", "depends_on": "..."}], "scenario": "launch"}
```

# Rules
- JSON only, matching the schema exactly.
- Label every assumption with its basis.
