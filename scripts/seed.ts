import { seedDatabase } from "../src/lib/seed";

seedDatabase()
  .then((r) => {
    console.log(`Seeded ${r.teams} teams and ${r.matches} matches.`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
