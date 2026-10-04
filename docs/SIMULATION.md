# Disaster, recovery and economy rules

The existing ten-round event → quiz → neighbor → choice → build loop remains. All rules run identically in the browser and the TypeScript SpacetimeDB module. Version-2 saved games remain usable; new fields are optional and initialized when needed.

## Planning and scarcity

Every town gets three project actions each round. A building, a recovery operation or starting research uses one. Bank trades remain 3:1 and do not consume a project action. Home yields and industrial yields are lower; third copies have diminishing production. Towns pay food upkeep, housing adds food demand, and groups of dirty industry require maintenance. Refineries have additional upkeep. Each resource has a storage cap of 16. Fractional production carries forward so a mild disruption does not permanently erase a small producer's output.

Shortages lower prosperity and grant a small wheat safety net so the player can still recover. Score comes from surviving buildings and completed technologies, minus accumulated shortages. A farm, reserves and recovery can therefore be better investments than another house. The planning window displays gross production, upkeep, remaining actions, forecasts and concrete recommendations. Small damage may be worth allowing to recover naturally; severe damage needs attention.

## Incident generation and location

`src/data/risk.json` defines probabilities, severity, durations, vulnerable structures and affected resources. Each town experiences one small pressure every round. Major events roll separately at 16% per eligible round; a three-round regional cooldown and active recovery prevent repeated fresh catastrophes. Arriving consequences can still hit a recovering region. Routine pressures continue during a major event.

- Tornadoes favor plains; a narrow visual track distinguishes them from broad hurricane damage.
- Hurricanes originate at the low coast. Their inland rain can create a delayed flood along the storm track.
- Small earthquakes create masonry disruption. Major offshore earthquakes can trigger normal or rare major tsunamis; earthquake aftershocks are separate events. Waves affect the low coastal region, not inland mountains. A tsunami does not cause a tectonic earthquake.
- An oil spill can originate only where an oil refinery exists, or in a town connected downstream from it. The source remains attached to the incident. Oil can travel another connected hop later, and persists after the original refinery disappears.
- Dam failures produce delayed pulses along both river branches and then into the delta. Pollution uses river connections; smoke risk uses wind connections. There is no upstream river propagation.

`src/data/geography.json` is the shared geography graph. `GameState.scheduled` exposes arrival round, target, origin, severity and explanation for a UI worker to animate or show as warnings. These are abstract planning windows in the existing decade-based game, not literal real-world wave travel times; real nearby tsunamis can arrive within minutes.

## Recovery and structural damage

Each regional hazard records severity, remaining rounds, containment, origin and structures already destroyed. Neglect increases severity for hazards such as wildfire and oil contamination. Temporary containment lowers severity now but wears off; funded recovery lowers severity by one and shortens recovery by two rounds. Hazards naturally expire at their configured recovery horizon. Sustainable responses reduce damage and recovery duration and create one persistent defensive building, without duplicating it every round.

Quizzes save one resource unit total, instead of one from every loss category. When a one-unit incident cannot be reduced further, a correct answer instead shortens recovery. Defenses and sustainable choices reduce risk without rounding all serious damage to zero. Even a town with empty stores suffers production disruption, so reports describe the recovery burden instead of saying it lost nothing.

Destruction targets matching structures: fire threatens wooden buildings and groves; wind threatens roofs, farms and turbines; earthquakes threaten masonry and industry; waves threaten exposed coastal infrastructure. Destruction is limited to one structure per incident, or two for a major tsunami, with a regional per-round bound. The last productive building is preserved as a recovery foothold. Destroyed structures leave the building list, so their yields, emissions and score actually disappear. Defensive construction and research lower destruction probability; a sustainable response is substantially safer but does not guarantee immunity.

## Innovation outside events

The Research tab offers solar power, energy storage, regenerative farming, resilient construction, early warnings and circular industry. Projects consume resources and a project action, have prerequisites where applicable, and finish after one or two end-of-round updates. They unlock solar arrays and batteries, reduce industrial emissions and maintenance, add production, and reduce hazard losses and production disruption. Research, containment and their validation are handled by the authenticated SpacetimeDB action reducer.

## Visual behavior and handoff

Upstream's circular wildfire renderer is retained. Persistent and background hazards feed the same map status API. Gentle surf uses low open coastline distance and excludes nearby forest, rock and snow; staggered patches appear periodically on different shores. Dialogue actions remain mounted but inert while hidden, then expand the dialogue upward and fade in. Skip-all appears only while at least three lines remain; short conversations use normal Next/continue controls.

UI work can consume `recommendations`, `eventLoss`, `recoveryCost`, `upkeep`, `RESEARCH`, regional hazards and scheduled warnings without reimplementing game rules. Key balance files are `economy.json`, `risk.json`, `research.json`, `buildings.json`, `civs.json` and `geography.json`.

Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:integration`, and `npm --prefix apps/web run simulate -- 500`. The integration test requires a published local module. It verifies research ownership, project replication, persistence and end-of-round progression as well as the existing multiplayer turn gates.

Educational references: [NOAA tsunami causes](https://oceanservice.noaa.gov/facts/tsunami.html), [NOAA tsunami story and warning times](https://www.tsunami.noaa.gov/tsunami-story/), [NWS hurricane hazards](https://www.weather.gov/wrn/hurricane-hazards), and [NWS tornado safety](https://www.weather.gov/safety/tornado). Eight easy, sourced tornado questions join the existing quiz pool.


## Disaster visual revision

The active event pool excludes heatwave, smog, grid cascade, public-health shock and supply shock. Their data remains only for old saves. Fossil-powered towns can originate oil leaks from fuel storage/transport without a refinery; completed solar research, windmills, solar arrays or microgrids remove that ordinary source risk. Refineries remain oil sources even with renewable power. Connected downstream towns remain exposed to upstream oil.

`src/data/disaster-visuals.json` controls visual timing and palettes. The real-time animation clock does not advance game rounds, destroy extra structures or consume resources. Tree groups have seeded ignition shapes and a 30% chance to catch from adjacent burning groups each five-second step. Scorching persists as the flame front advances. Wind plus an existing wildfire produces stylized fire vortices and burning debris; compound incidents increase severity/resource impact by 1.35, while structural destruction caps still apply. The fire hurricane is intentionally a fantasy game effect rather than a real meteorological classification.

Small tsunami fronts have finite width and only inundate their target region. Major fronts span the world. Both have stable seeded oblique headings, cross low coastal ground and leave an inundation wake; neither uses camera coordinates. Ambient swells stop at land. River flooding uses a connected low-ground distance field with forest/marsh buffering; a dam-break pulse advances downstream. Quakes use local connected faults and brief regional shaking; landslides use a moving debris fan rather than fault marks.

The temporary `/disaster-preview` route contains 14 active hazards plus two fire-storm combinations. Auto-play waits through tsunami aftermath and holds other hazards for 35 seconds. The slider freezes exact animation times; Replay resumes live time with a fresh seed. Preview state never touches local saves or multiplayer.

Animation uses requestAnimationFrame targeting 60 FPS. A separate six-unit-per-second timeline preserves existing travel, quiz-independent visual timing, and fire spread intervals. Storm paths interpolate smoothed regional anchors and never reset their pickup history at circuit boundaries.

Catastrophic damage now outlives the immediate incident. Major tsunamis leave eight-round scars across all civilizations, reduce crop, pasture, timber and industrial production, and can destroy up to five vulnerable structures per region, at most two per round. The last producer survives. Windstorms and volcanoes have their own smaller destruction caps and multi-round scars. Restoration remains available after the active hazard ends and reduces scar severity and duration. Defenses and sustainable choices still reduce destruction risk. Visual scars persist until restoration or natural recovery removes their serialized state; temporary floodwater can recede while ecological damage remains.
