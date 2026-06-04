import { syncLiveResults } from "../src/lib/sync";

syncLiveResults()
  .then((r) => {
    console.log("Sync result:", r);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
