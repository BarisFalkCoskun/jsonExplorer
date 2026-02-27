# Todo

## Future Ideas

### Substitute Group Labeling
Train a model to identify which products can substitute for each other (e.g., honey <-> maple syrup). Approach:

1. **Start with group-based labeling** — add a `substituteGroup` field (same pattern as `category`). Select items, assign a group name (e.g., "sweetener", "thickener"). Items sharing a group are interchangeable.
2. **Later: pairwise links** — for finer-grained relationships, store `substitutes: ["item_a", "item_b"]` arrays on each document. Captures specific pairs rather than flat groups.
3. **Model training** — embed product features into a vector space, train with contrastive loss (substitutes close, non-substitutes far). At inference, nearest neighbors = suggested substitutes.

The group approach reuses the existing `patchDocument()` + labeling workflow and is the fastest way to collect training data.
