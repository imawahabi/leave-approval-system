import fs from 'fs';
import readline from 'readline';

async function findUserInputs() {
  const logPath = 'C:/Users/mawah/.gemini/antigravity-ide/brain/7fec635a-2ece-4a16-b085-7bc2e1ad0d13/.system_generated/logs/transcript.jsonl';
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let count = 0;
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        count++;
        console.log(`\n=== USER INPUT #${count} (step ${obj.step_index}) ===`);
        console.log(obj.content);
      }
    } catch (e) {}
  }
}
findUserInputs();
