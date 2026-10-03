# Production roadmap

The foundation runs end to end in offline practice and through a native TypeScript SpacetimeDB module. The frontend uses the original world asset and castle provinces. The rule tests and local two-identity integration check are runnable from the root README.

Remaining work before a public competitive release:

1. Replace immediate bilateral swaps with offers and explicit acceptance. Add host migration, disconnection grace periods, automatic quiz timeout resolution, room expiry, rate limits, and reconnect UX inside the game.
2. Replace public full-state rows with private player views for forecasts and sensitive quiz information. Retain backend-owned rules, server clocks, and revision checks.
3. Reconcile original-spec gameplay profiles with the repository's detailed province geography. Add actual terrain-derived river paths, pollution cells, reservoir storage, water quality, evacuation, and per-province damage routing. Current province groupings visualize aggregate district state.
4. Leader select (arcade layout from the Civilizations artboard) and a talking advisor narrator are in place. Your civilization's advisor narrates the intro, each decade's briefing, the ripple effects and the debrief. Still missing: neighbor envoys speaking in other civs' events (Event 2 artboard), the three-choice management response, and pan-to-source camera moves.
5. Review and expand each question pool with precise source passages, teacher controls, localization, accessible timer options, and nonrepeating questions throughout longer campaigns. Current questions link original educational agency sources; some links are topic portals.
6. Tune balance with comparable AI strategies and mirrored seeds. Stress tests establish bounded state and reachable cooperative wins/collapse, not equal civilization win rates.
7. Audit keyboard navigation, modal focus trapping, screen-reader flow descriptions, touch camera gestures, contrast, mobile panels, and production monitoring.
8. Validate cloud configuration and Docker/AWS deployment on the chosen account. Local native publishing and SDK integration are verified; no paid infrastructure or cloud database has been created.

The chosen game loop remains the attached specification's ten decades and +3°C shared collapse, with a three-decade climate accord and prosperity scoring. The repository's alternate 41-turn 2018–2100 campaign can be added as a scenario later.

**Update (cycle redesign):** the game now runs as event → quiz → choice → build with five resources and one growing town per civ (see `AGENTS.md` §0). Items above about trades, forecasts, provinces and districts refer to the previous design. Balance target from `npm run simulate`: roughly 15% of all-AI games collapse, and the civs that pick sustainable options most often win.

