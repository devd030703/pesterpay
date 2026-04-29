import { agentTick } from "./src/lib/agent";

async function main() {
  console.log("Seeding demo...");
  const { seedDemo } = await import("./src/lib/store");
  seedDemo();

  console.log("Calling agentTick...");
  const result = await agentTick();
  console.log("Result:", result);
}

main().catch(console.error);
