// XP levels. XP itself is counted in the database (xp_of in supabase/005_public_social_game.sql):
// 10 per daily call, +15 per correct call, 10 per post/poll/note, 5 per trade,
// 2 per like and 3 per comment you receive, 100 per friend who joins and sets up.
export const LEVELS = [
  { min: 0, name: "Rookie" },
  { min: 100, name: "Scout" },
  { min: 300, name: "Analyst" },
  { min: 700, name: "Strategist" },
  { min: 1500, name: "Pro" },
  { min: 3000, name: "Expert" },
  { min: 6000, name: "Legend" },
];

// { level (1-based), name, xp, min, next (xp for next level or null), progress 0..1 }
export function levelFor(xp = 0) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1]?.min ?? null;
  const min = LEVELS[i].min;
  return { level: i + 1, name: LEVELS[i].name, xp, min, next, progress: next ? (xp - min) / (next - min) : 1 };
}
