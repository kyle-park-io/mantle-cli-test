/**
 * mantle-cli swap approve 명령어 테스트
 *
 * 테스트 항목:
 *  1. 기본 동작 — calldata 구조 검증
 *     - 셀렉터 (approve(address,uint256) = 0x095ea7b3)
 *     - spender 주소 ABI 인코딩
 *     - amount ABI 인코딩 정확성
 *     - token 컨트랙트 주소 (to 필드)
 *     - value = 0x0 (ERC-20 approve는 ETH value 불필요)
 *  2. max — uint256 최댓값(0xff...ff) 인코딩 + 경고 포함 여부
 *  3. amount 포맷 허용/거부 케이스
 *     - [허용] 소수 ("1.5"), 정수 ("50"), "max"
 *     - [거부] 0x 포함 hex ("0x5F5E100"), 0x 없는 hex ("5F5E100")
 *  4. 잘못된 spender 주소 거부
 */

import assert from "assert";
import { runCli, assertUnsignedTx, makeRunner } from "../utils/cli.js";
import { loadPrimaryAddress } from "../utils/addresses.js";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const AGNI_ROUTER   = "0x319B69888b0d11cEC22caA5034e25FfFBDc88421";
const USDC_CONTRACT = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9".toLowerCase();
const APPROVE_SELECTOR = "0x095ea7b3";
const UINT256_MAX   = "f".repeat(64);

loadPrimaryAddress(); // addresses.js 로드 확인용

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function decodeApproveAmount(data) {
  return BigInt("0x" + data.slice(74, 138));
}

function decodeApproveSpender(data) {
  return "0x" + data.slice(10, 74).slice(24);
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

const { test, summary } = makeRunner();

// ---------------------------------------------------------------------------
// 1. 기본 동작
// ---------------------------------------------------------------------------

console.log("\n[swap approve — 기본 구조]");

// [허용] approve 트랜잭션이 정상 생성되어야 한다
test("USDC 100 approve 트랜잭션이 생성된다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "100"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.intent, "approve");
  assertUnsignedTx(res.unsigned_tx);
});

// [허용] to 필드가 token(USDC) 컨트랙트 주소여야 한다
test("unsigned_tx.to 가 USDC 컨트랙트 주소이다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "100"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.unsigned_tx.to.toLowerCase(), USDC_CONTRACT, `to 불일치: ${res.unsigned_tx.to}`);
});

// [허용] ERC-20 approve 는 ETH value 가 0 이어야 한다
test("unsigned_tx.value 는 0x0 이다 (ERC-20 approve는 ETH value 불필요)", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "100"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.unsigned_tx.value, "0x0", `value 불일치: ${res.unsigned_tx.value}`);
});

// [허용] calldata 앞 4바이트가 approve(address,uint256) 셀렉터여야 한다
test("calldata 앞 4바이트가 approve(address,uint256) 셀렉터이다 (0x095ea7b3)", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "100"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(
    res.unsigned_tx.data.toLowerCase().startsWith(APPROVE_SELECTOR),
    `셀렉터 불일치: ${res.unsigned_tx.data.slice(0, 10)}`
  );
});

// [허용] spender 주소가 calldata에 올바르게 ABI 인코딩되어야 한다
test("spender 주소가 calldata에 ABI 인코딩되어 있다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "100"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(decodeApproveSpender(res.unsigned_tx.data), AGNI_ROUTER.toLowerCase());
});

// [허용] calldata amount 가 정수 입력에 대해 정확히 인코딩되어야 한다
test("calldata amount — '100' USDC 가 100_000_000 (0x5F5E100) 으로 인코딩된다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "100"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(decodeApproveAmount(res.unsigned_tx.data), 100_000_000n);
});

// [허용] calldata amount 가 소수 입력에 대해 정확히 인코딩되어야 한다
test("calldata amount — '1.5' USDC 가 1_500_000 (0x16E360) 으로 인코딩된다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "1.5"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(decodeApproveAmount(res.unsigned_tx.data), 1_500_000n);
});

// ---------------------------------------------------------------------------
// 2. max approve
// ---------------------------------------------------------------------------

console.log("\n[swap approve — max]");

// [허용] max approve 트랜잭션이 정상 생성되어야 한다
test("'max' approve 트랜잭션이 생성된다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "max"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.intent, "approve");
  assertUnsignedTx(res.unsigned_tx);
});

// [허용] max approve 의 calldata amount 가 uint256 최댓값이어야 한다
test("'max' approve — calldata amount 가 uint256 최댓값 (0xff...ff) 이다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "max"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(res.unsigned_tx.data.toLowerCase().endsWith(UINT256_MAX));
});

// [허용] max approve 는 경고(warnings)를 포함해야 한다
test("'max' approve 는 무제한 승인 경고를 포함한다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "max"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(Array.isArray(res.warnings) && res.warnings.length > 0, "경고가 없습니다.");
});

// ---------------------------------------------------------------------------
// 3. amount 포맷 허용/거부
// ---------------------------------------------------------------------------

console.log("\n[amount 포맷 — swap approve]");

// [허용] 소수 입력
test("[허용] 소수 '1.5' USDC 가 처리된다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "1.5"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assertUnsignedTx(res.unsigned_tx);
});

// [허용] 정수 입력
test("[허용] 정수 '50' USDC 가 처리된다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "50"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assertUnsignedTx(res.unsigned_tx);
});

// [허용] max 키워드
test("[허용] 'max' 키워드가 처리된다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "max"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assertUnsignedTx(res.unsigned_tx);
});

// [거부] 0x 접두사 포함 hex 는 amount 로 사용 불가
test("[거부] 0x 포함 hex amount ('0x5F5E100') 는 오류를 반환한다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "0x5F5E100"]);
  assert.ok(res.error, "거부되어야 합니다.");
});

// [거부] 0x 없는 hex 문자열도 amount 로 사용 불가
test("[거부] 0x 없는 hex amount ('5F5E100') 는 오류를 반환한다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", AGNI_ROUTER, "--amount", "5F5E100"]);
  assert.ok(res.error, "거부되어야 합니다.");
});

// ---------------------------------------------------------------------------
// 4. 잘못된 spender 주소 거부
// ---------------------------------------------------------------------------

console.log("\n[swap approve — spender 검증]");

// [거부] 너무 짧은 주소는 유효하지 않다
test("[거부] 짧은 주소 ('0xdeadbeef') spender 는 오류를 반환한다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", "0xdeadbeef", "--amount", "100"]);
  assert.ok(res.error, "거부되어야 합니다.");
});

// [거부] 주소 형식이 아닌 문자열은 유효하지 않다
test("[거부] 문자열 spender ('agni') 는 오류를 반환한다", () => {
  const res = runCli(["swap", "approve", "--token", "USDC", "--spender", "agni", "--amount", "100"]);
  assert.ok(res.error, "거부되어야 합니다.");
});

summary();
