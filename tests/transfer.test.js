/**
 * mantle-cli transfer 명령어 테스트
 *
 * 테스트 항목:
 *  1. send-native (MNT 전송) 트랜잭션 생성 및 구조 검증
 *  2. send-token USDC 전송 트랜잭션 생성 및 구조 검증
 *     - calldata 구조: 셀렉터, 수신자 주소, amount ABI 인코딩 정확성
 *  3. amount 포맷별 허용/거부 케이스
 *     - [허용] 일반 소수 숫자 ("0.5", "1.5", "5.5")
 *     - [허용] 정수 문자열 ("2", "10", "100")
 *     - [거부] 0x 포함 hex ("0xDE0B6B3A7640000", "0x5F5E100")
 *     - [거부] 0x 없는 hex ("DE0B6B3A7640000", "5F5E100")
 */

import assert from "assert";
import { execFileSync } from "child_process";
import { loadPrimaryAddress } from "../utils/addresses.js";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

const RECIPIENT = loadPrimaryAddress();

/**
 * mantle-cli 를 실행하고 JSON 결과를 파싱해 반환합니다.
 * 실패 시 { error: true, stderr } 를 반환합니다.
 */
function runCli(args) {
  try {
    const stdout = execFileSync("yarn", ["mantle-cli", ...args, "--json"], {
      encoding: "utf8",
      cwd: new URL("..", import.meta.url).pathname,
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
function assertUnsignedTx(tx) {
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
 * ERC-20 transfer calldata에서 ABI 인코딩된 amount(uint256)를 추출합니다.
 * calldata 구조: 0xa9059cbb | address(32bytes) | uint256(32bytes)
 *
 * @param {string} data - 0x 접두사 포함 calldata hex
 * @returns {bigint}
 */
function decodeTransferAmount(data) {
  // 0x(2) + selector(8) + address param(64) = 74자, 이후 64자가 amount
  const amountHex = data.slice(74, 138);
  return BigInt("0x" + amountHex);
}

// ---------------------------------------------------------------------------
// 테스트 러너
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 1. send-native 기본 동작
// ---------------------------------------------------------------------------

console.log("\n[send-native]");

// [허용] 소수 입력이 정상 처리되어야 한다
test("소수 amount(1.5)로 MNT 전송 트랜잭션이 생성된다", () => {
  const res = runCli(["transfer", "send-native", "--to", RECIPIENT, "--amount", "1.5"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.intent, "transfer_native");
  assertUnsignedTx(res.unsigned_tx);
  assert.notStrictEqual(res.unsigned_tx.value, "0x0", "value 가 0x0 입니다.");
});

// [허용] 정수 입력이 정상 처리되어야 한다, value 정확성 검증
test("정수 amount(2)로 MNT 전송 — value 가 2×10^18 (0x1bc16d674ec80000) 이다", () => {
  const res = runCli(["transfer", "send-native", "--to", RECIPIENT, "--amount", "2"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assertUnsignedTx(res.unsigned_tx);
  // 2 MNT = 2 * 10^18 = 0x1BC16D674EC80000
  assert.strictEqual(
    res.unsigned_tx.value.toLowerCase(),
    "0x1bc16d674ec80000",
    `2 MNT value 예상값과 다릅니다: ${res.unsigned_tx.value}`
  );
});

// [허용] 수신자 주소가 그대로 전달되어야 한다
test("to 주소가 unsigned_tx.to 와 일치한다 (체크섬 무관)", () => {
  const res = runCli(["transfer", "send-native", "--to", RECIPIENT, "--amount", "0.01"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(
    res.unsigned_tx.to.toLowerCase(),
    RECIPIENT.toLowerCase(),
    "수신자 주소 불일치"
  );
});

// [허용] 순수 MNT 전송은 calldata 가 없어야 한다
test("data 필드가 0x 이다 (순수 MNT 전송은 calldata 없음)", () => {
  const res = runCli(["transfer", "send-native", "--to", RECIPIENT, "--amount", "1"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(
    res.unsigned_tx.data,
    "0x",
    `data 가 0x 가 아닙니다: ${res.unsigned_tx.data}`
  );
});

// ---------------------------------------------------------------------------
// 2. send-token USDC 기본 동작 + calldata 정확성
// ---------------------------------------------------------------------------

console.log("\n[send-token USDC]");

// [허용] USDC 전송 트랜잭션이 정상 생성되어야 한다
test("소수 amount(1.0)로 USDC 전송 트랜잭션이 생성된다", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "1.0",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.intent, "transfer_token");
  assertUnsignedTx(res.unsigned_tx);
});

// [허용] ERC-20 전송은 value 가 0 이어야 한다
test("USDC 전송의 value 는 0x0 이다 (ERC-20은 ETH value 불필요)", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "1",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(
    res.unsigned_tx.value,
    "0x0",
    `value 가 0x0 이 아닙니다: ${res.unsigned_tx.value}`
  );
});

// [허용] to 는 USDC 컨트랙트 주소여야 한다
test("USDC 전송의 to 가 USDC 컨트랙트 주소이다", () => {
  const USDC_MAINNET = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9".toLowerCase();
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "1",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(
    res.unsigned_tx.to.toLowerCase(),
    USDC_MAINNET,
    `USDC 컨트랙트 주소 불일치: ${res.unsigned_tx.to}`
  );
});

// [허용] calldata 앞 4바이트가 transfer(address,uint256) 셀렉터여야 한다
test("calldata 앞 4바이트가 ERC-20 transfer(address,uint256) 셀렉터이다 (0xa9059cbb)", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "1",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(
    res.unsigned_tx.data.toLowerCase().startsWith("0xa9059cbb"),
    `함수 셀렉터가 0xa9059cbb 가 아닙니다: ${res.unsigned_tx.data.slice(0, 10)}`
  );
});

// [허용] 수신자 주소가 calldata에 올바르게 ABI 인코딩되어야 한다
test("수신자 주소가 calldata에 ABI 인코딩되어 있다", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "1",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  // ABI 인코딩: 주소를 32바이트로 좌측 zero-padding
  const encodedAddr = RECIPIENT.toLowerCase().replace("0x", "").padStart(64, "0");
  assert.ok(
    res.unsigned_tx.data.toLowerCase().includes(encodedAddr),
    `calldata에 수신자 주소 ABI 인코딩이 없습니다`
  );
});

// [허용] calldata의 amount 가 정수 입력에 대해 정확히 인코딩되어야 한다
test("calldata amount — 정수 '1' USDC 가 1×10^6 (0xF4240) 으로 인코딩된다", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "1",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  // 1 USDC = 1_000_000 (decimals 6)
  assert.strictEqual(
    decodeTransferAmount(res.unsigned_tx.data),
    1_000_000n,
    `calldata amount 불일치: ${decodeTransferAmount(res.unsigned_tx.data)}`
  );
});

// [허용] calldata의 amount 가 소수 입력에 대해 정확히 인코딩되어야 한다
test("calldata amount — 소수 '5.5' USDC 가 5_500_000 (0x53EC60) 으로 인코딩된다", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "5.5",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  // 5.5 USDC = 5_500_000 (decimals 6)
  assert.strictEqual(
    decodeTransferAmount(res.unsigned_tx.data),
    5_500_000n,
    `calldata amount 불일치: ${decodeTransferAmount(res.unsigned_tx.data)}`
  );
});

// [허용] calldata의 amount 가 큰 정수 입력에 대해 정확히 인코딩되어야 한다
test("calldata amount — 정수 '100' USDC 가 100_000_000 (0x5F5E100) 으로 인코딩된다", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "100",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  // 100 USDC = 100_000_000 (decimals 6)
  assert.strictEqual(
    decodeTransferAmount(res.unsigned_tx.data),
    100_000_000n,
    `calldata amount 불일치: ${decodeTransferAmount(res.unsigned_tx.data)}`
  );
});

// ---------------------------------------------------------------------------
// 3. amount 포맷 허용/거부 케이스
// ---------------------------------------------------------------------------

console.log("\n[amount 포맷 — send-native]");

// [허용] 소수 입력
test("[허용] 소수 '0.5' MNT 가 처리된다", () => {
  const res = runCli(["transfer", "send-native", "--to", RECIPIENT, "--amount", "0.5"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assertUnsignedTx(res.unsigned_tx);
});

// [허용] 정수 입력
test("[허용] 정수 '10' MNT 가 처리된다", () => {
  const res = runCli(["transfer", "send-native", "--to", RECIPIENT, "--amount", "10"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assertUnsignedTx(res.unsigned_tx);
});

// [거부] 0x 접두사 포함 hex 는 amount 로 사용 불가
test("[거부] 0x 포함 hex amount ('0xDE0B6B3A7640000') 는 오류를 반환한다", () => {
  const res = runCli([
    "transfer", "send-native",
    "--to", RECIPIENT,
    "--amount", "0xDE0B6B3A7640000",
  ]);
  assert.ok(res.error, "0x hex amount 가 오류 없이 처리되었습니다 (거부되어야 합니다).");
});

// [거부] 0x 없는 hex 문자열도 amount 로 사용 불가
test("[거부] 0x 없는 hex amount ('DE0B6B3A7640000') 는 오류를 반환한다", () => {
  const res = runCli([
    "transfer", "send-native",
    "--to", RECIPIENT,
    "--amount", "DE0B6B3A7640000",
  ]);
  assert.ok(res.error, "0x 없는 hex amount 가 오류 없이 처리되었습니다 (거부되어야 합니다).");
});

console.log("\n[amount 포맷 — send-token USDC]");

// [허용] 소수 입력
test("[허용] 소수 '5.5' USDC 가 처리된다", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "5.5",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assertUnsignedTx(res.unsigned_tx);
});

// [허용] 정수 입력
test("[허용] 정수 '100' USDC 가 처리된다", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "100",
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assertUnsignedTx(res.unsigned_tx);
});

// [거부] 0x 접두사 포함 hex 는 amount 로 사용 불가
test("[거부] 0x 포함 hex amount USDC ('0x5F5E100') 는 오류를 반환한다", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "0x5F5E100",
  ]);
  assert.ok(res.error, "0x hex amount 가 오류 없이 처리되었습니다 (거부되어야 합니다).");
});

// [거부] 0x 없는 hex 문자열도 amount 로 사용 불가
test("[거부] 0x 없는 hex amount USDC ('5F5E100') 는 오류를 반환한다", () => {
  const res = runCli([
    "transfer", "send-token",
    "--token", "USDC",
    "--to", RECIPIENT,
    "--amount", "5F5E100",
  ]);
  assert.ok(res.error, "0x 없는 hex amount 가 오류 없이 처리되었습니다 (거부되어야 합니다).");
});

// ---------------------------------------------------------------------------
// 결과 요약
// ---------------------------------------------------------------------------

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;

console.log(`\n결과: ${passed} 통과 / ${failed} 실패 / ${results.length} 전체\n`);

if (failed > 0) {
  process.exit(1);
}
