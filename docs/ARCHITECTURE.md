# Architecture

The production path is TypeScript frontend → official SDK WebSocket subscriptions → native TypeScript SpacetimeDB reducers. `spacetime/src/index.ts` imports the same pure engine used by offline practice and tests. Rooms store serializable state and monotonic revisions. Identity-bound seats restrict actions; all claimed seats must be ready before the backend resolves a turn. Question start and answer reducers use server timestamps and validate the active question.

The runtime map is the existing 1280 × 800 pixel world image. Sixteen castle provinces group 56 logical districts. Internal IDs from the original attached specification remain stable: heartland → Highland Hold, enclave → Verdant Reach, petrostate → Forge Dominion, archipelago → Tidehaven. Gameplay profiles follow that expanded specification; the repository art is the visual geography. Castle grouping and aggregate arrows are not cell-level hydrological routing.

# Simulation architecture

## Boundaries

The engine imports only TypeScript content and contracts. It does not import React,
read the DOM, fetch data, call a model, use the clock or access browser storage.
`applyAction`, `resolveRound`, `answerQuiz` and `nextRound` clone their input before
changing state. Invalid actions return the original state and an explanation.
`propagate` and RNG helpers mutate the internal working copy; direct tests use
fresh worlds. All state is JSON-serializable and carries `version: 1`.

The LCG seed and monotonically numbered cause IDs make the same state and actions
produce the same resolution. The quiz UI passes elapsed milliseconds explicitly;
timing is not hidden inside the simulation. Seed changes appear in exported saves.

## Phase lifecycle

1. **Initialize/income:** grant first-decade positive production, without initial
   consumption penalties. The next income steps include actual consumption.
2. **Planning:** three AP each. Construction, research, repairs, conversions,
   trade, aid and policies resolve immediately in the local game. Verdant Reach forecast
   publication is free and can happen once per decade.
3. **Resolve:** solo bots spend their remaining AP; recurring deals settle; wind
   direction rolls; hazards are sampled per eligible civilization and type.
4. **Flows:** propagate hazards and resolve losses. Market reprices after physical
   disruption. The UI sequentially reveals streams with cause captions.
5. **Quiz:** at most one session per affected civ, from its strongest impact.
   Each answer is recorded once. Complete sessions get rapid/solid/slow recovery.
6. **Debrief:** explanations, science links and metrics summarize the decade.
7. **Next decade:** check collapse, Concordat and ten-decade completion; otherwise
   pay income and consumption while disruptions still apply, then decrement
   disruption duration, reset AP and forecast, and append a historical snapshot.

Climate crossing +3°C always overrides an individual or shared win. If income
itself crosses the threshold, the next planning phase is replaced by the endgame.

## Geography and accounting

The authored axial map has 56 hexes. Ownership, terrain, coast and fault flags are
fixed. Regions are grouped by civilization for carrier routing; individual tiles
determine yields, exposure, damage, natural buffering and infrastructure effects.

Carriers are river, wind, ocean current, coast, fault and local. Wind reverses its
directed graph roughly one decade in four. River flow is downstream; coast and
fault edges connect multiple regions. A path cannot revisit a civilization, so
bidirectional edges cannot create infinite loops.

For each incoming amount, the ledger records:

```text
incoming = natural buffering + local impact + transmitted + dissipated
```

Outgoing weights are normalized before splitting the remaining amount. Edge
decay is accounted as dissipation; streams below the display threshold also
dissipate. A barrier reduces local impact and increases the residual routed
onward. Without an outlet, residual hazard is still recorded as dissipation.
Natural buffering represents storage or energy attenuation in this abstract model,
not an assertion that wetlands destroy water. Different real hazards use different
physical quantities; the shared ledger tracks game hazard pressure, not a universal
scientific conservation law.

An earthquake can break a vulnerable dam, creating a **new** river hazard sourced
from stored water. It preserves the construction cause ID. This secondary source
is separate from the earthquake’s ledger. Strong offshore quakes may independently
spawn a tsunami. Geological probabilities never scale with climate.

## Economy

Terrain and functioning buildings produce resources. Urban growth increases future
food/water demand. Fisheries scale with ocean health. Oil productivity falls with
finite reserves. Electrified facilities require at least two available energy to
operate; their energy demand appears in net income.

Negative essential stocks clamp to zero and reduce wellbeing; stocks never become
debt. Food spoils slightly outside Highland Hold. Aquifer depletion affects western and
upstream water yields; water diversion benefits Highland Hold while lowering delta
water yields. Sanctuaries remove game carbon and restore ocean vitality. Agriculture
and desalination create small ocean costs. Fossil activity affects trust and the
relations of exposed neighbors.

Orders use finite market inventory, current prices and spreads. Each order moves
its resource’s price immediately. At resolution, projected supply, unmet needs,
embargoes, shipping restrictions and actual disaster losses determine a smoothed
target price. Prices are bounded. Trust narrows spreads; class passives and tariffs
adjust quotes. Tech licenses use a fixed ten-credit price.

Recurring deals verify both parties’ stocks and policy restrictions each decade.
They transfer equal quantities, conserving bilateral resources. A failed shipment
ends the deal and damages relations. Hot-seat users authorize both seats’ swaps
on the shared screen; this is not an asynchronous multiplayer offer protocol.

Prosperity scores include credits, wellbeing, population, discoveries,
infrastructure integrity and capped inventory value. Fixed inventory valuations
prevent an embargo-driven price spike from inflating endgame assets. Current fossil
emissions and ocean health scale the result.

## Recovery and education

Each question has an original prompt, four options, a correct index, explanation,
event tags, difficulty and primary-source link. Pools exclude globally used IDs.
Small event pools can exhaust late in a game; exhausted pools are skipped rather
than repeating content. The bank is a seed for a larger editorial content pipeline.

- Rapid: all correct and at least half under eight seconds; refund 25% of resource
  losses and reduce disruption by two.
- Solid: more than half correct; refund 10% and reduce disruption by one.
- Slow: no additional penalty and no recovery bonus.

Timeouts cannot score correct. Recovery only changes the answering civilization’s
stocks and unique damaged tiles. It never recalculates flows, market prices, global
climate or ocean health. Building integrity still requires manual repair.

## AI

Rule bots prioritize essentials, damaged infrastructure, context-dependent statecraft,
aid, their class’s technology branch, suitable construction and surplus exports.
They tax or block shipping in response to emissions/hostility, can retaliate with
embargoes, and can de-escalate when the polluter transitions. They consider the
Concordat from decade six. Trades proposed by a human require sufficient resources,
acceptable relative value and non-hostile relations. No paid model is required.

## Online authority

The native module owns online state and validates identity, seat, action shape, resources, AP and revision before committing changes. It collects seat readiness, runs bots only for unclaimed civilizations, resolves turns, and publishes updates through room subscriptions. The host advances shared phases. Quiz clocks and active-question checks run in the database. Offline practice uses the identical pure rules locally.

Production extensions include trade offer acceptance, private forecast views, timed-out player handling, host migration, room cleanup, and versioned migrations. Public JSON rows currently expose game state to other subscribers; this is not a private competitive matchmaking service.
