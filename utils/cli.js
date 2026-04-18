import assert from "assert";
import { execFileSync } from "child_process";

const CWD = new URL("..", import.meta.url).pathname;

/**
 * mantle-cli 를 실행하고 JSON 결과를 파싱해 반환합니다.
 * 실패 시 { error: true, stderr } 를 반환합니다.
 */
export function runCli(args) {
  try {
    const stdout = execFileSync("yarn", ["mantle-cli", ...args, "--json"], {
      encoding: "utf8",
      cwd: CWD,
    });
    return { error: false, ...JSON.parse(stdout) };
  } catch (err) {
    return {
      error: true,
      stderr: err.stderr ?? err.message,
      stdout: err.stdout ?? "",
    };
  }
}

/**
 * unsigned_tx 필드가 올바른 구조인지 검증합니다.
 */
export function assertUnsignedTx(tx) {
  assert.ok(tx, "unsigned_tx 필드가 없습니다.");
  assert.ok(
    typeof tx.to === "string" && tx.to.startsWith("0x"),
    `unsigned_tx.to 가 유효한 주소가 아닙니다: ${tx.to}`
  );
  assert.strictEqual(tx.chainId, 5000, `chainId 가 5000이 아닙니다: ${tx.chainId}`);
  assert.ok(
    typeof tx.data === "string" && tx.data.startsWith("0x"),
    `unsigned_tx.data 가 hex 문자열이 아닙니다: ${tx.data}`
  );
  assert.ok(
    typeof tx.value === "string" && tx.value.startsWith("0x"),
    `unsigned_tx.value 가 hex 문자열이 아닙니다: ${tx.value}`
  );
}

/**
 * 테스트 러너
 */
export function makeRunner() {
  const results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name, pass: true });
      console.log(`  ✓ ${name}`);
    } catch (err) {
      results.push({ name, pass: false, error: err.message });
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  function summary() {
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n결과: ${passed} 통과 / ${failed} 실패 / ${results.length} 전체\n`);
    if (failed > 0) process.exit(1);
  }

  return { test, summary };
}
