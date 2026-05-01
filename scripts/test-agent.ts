import { agentTick } from "../src/lib/agent";
import { seedDemo } from "../src/lib/store";

async function test() {
  seedDemo();
  const result = await agentTick();
  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
