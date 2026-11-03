// ===== The match: what is drawn at random once per match and then stays the same =====
// Match(seed) -> { seed, rng() }. rng is a seeded random generator, so everything picked from it (who stands where,
// robe and skin colours, which two figures the players are) is the same for anyone who starts from the same seed:
// a networked match only has to share the seed. A new page load is a new match with a new seed.
const Match = (seed = Math.floor(Math.random() * 2147483646) + 1) => {
  let sd = seed % 2147483647 || 1;
  const rng = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  return { seed, rng };
};
