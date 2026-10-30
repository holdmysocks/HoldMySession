/** Lines for the empty space beside the activity grid. Long and airy at first, terse as a year fills up. */
const TIERS: string[][] = [
  [
    'A fresh canvas. Look at all this room to think in. Every great history starts with one slightly confused first prompt.',
    'So much space! I would fill it with a poem, but the tokens are better spent on your code.',
    'The grid is mostly empty, which means every square from here on is a small, personal victory.',
    'Plenty of room. Stretch out, put your feet up, ask me something ambitious.',
    'Day one energy. Somewhere out there is a bug that does not know you are coming for it yet.',
  ],
  [
    'Getting going. The squares are lining up nicely, and I am only mildly judging the 2am ones.',
    'A few weeks in and the grid is warming up. Space left over: plenty. Regrets: none so far.',
    'You are building a streak, or at least a respectable cluster. I will take it.',
    'Still roomy in here. I have been rehearsing small talk for exactly this gap.',
  ],
  [
    'Filling in nicely. This corner still has some leg room, but I can see where this is heading.',
    'Months of company. I feel like we should have matching jackets by now.',
    'The empty space is shrinking, and so is my small talk budget.',
    'Look at that, a real history. Still a little elbow room on the right.',
  ],
  [
    'Getting cosy in here.',
    'The grid is filling up. Mind the elbows.',
    'Not much room left. Choose your words wisely.',
    'Quarter by quarter, the squares close in.',
  ],
  ['Snug.', 'Almost a full year.', 'Cramped. Good cramped.', 'No room for chat.'],
]

const WEEKS_PER_YEAR = 53
const TIER_UPPER_WEEKS = [4, 12, 26, 40]

/** How many weeks of history the grid shows maps to a tier, so the text gets shorter as the grid gets full. */
export function flavorTier(weeks: number): number {
  const i = TIER_UPPER_WEEKS.findIndex((upper) => weeks <= upper)
  return i === -1 ? TIERS.length - 1 : i
}

/** A line for the current history length. `seed` is 0..1 and picks among the lines, so it can change per page load. */
export function activityFlavor(weeks: number, seed: number): string {
  const lines = TIERS[flavorTier(weeks)]
  return lines[Math.min(lines.length - 1, Math.floor(seed * lines.length))]
}

/** Width the grid leaves free for the text: a wide gap for a short history, none for a full year. */
export function flavorReserve(weeks: number, gridWidth: number): number {
  if (gridWidth < 640) return 0
  const reserve = Math.round(340 * (1 - weeks / WEEKS_PER_YEAR))
  return reserve >= 90 ? reserve : 0
}
