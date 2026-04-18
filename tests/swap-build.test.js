/**
 * mantle-cli swap build-swap 명령어 테스트 (fluxion, USDC → wTSLAx)
 *
 * 흐름: defi swap-quote 로 minimum_out_raw 를 먼저 조회한 뒤
 *       swap build-swap 에 --amount-out-min 으로 전달
 *
 * 테스트 항목:
 *  1. quote 응답 구조 검증
 *  2. 트랜잭션 기본 구조 검증
 *     - unsigned_tx.to = Fluxion 라우터
 *     - calldata 셀렉터 (exactInputSingle = 0x414bf389)
 *  3. calldata 파라미터 정확성
 *     - tokenIn, tokenOut, recipient, amountIn, amountOutMinimum
 *  4. amount 포맷 허용/거부 케이스
 *     - [거부] --amount-out-min 누락
 *     - [거부] 0x 포함 hex amount
 *     - [거부] 0x 없는 hex amount (알파벳 포함)
 */

import assert from "assert";
import { runCli, assertUnsignedTx, makeRunner } from "../utils/cli.js";
import { loadPrimaryAddress } from "../utils/addresses.js";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const FLUXION_ROUTER  = "0x5628a59dF0ECAC3f3171f877A94bEb26BA6DFAa0".toLowerCase();
const USDC_CONTRACT   = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9".toLowerCase();
const WTSLAX_CONTRACT = "0x43680abf18cf54898be84c6ef78237cfbd441883".toLowerCase();
const EXACT_INPUT_SINGLE_SELECTOR = "0x414bf389";

const RECIPIENT = loadPrimaryAddress();

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/**
 * exactInputSingle calldata를 디코딩합니다.
 * 파라미터 순서: tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96
 */
function decodeExactInputSingle(data) {
  const params = data.slice(10);
  const read = (i) => params.slice(i * 64, (i + 1) * 64);
  return {
    tokenIn:           "0x" + read(0).slice(24),
    tokenOut:          "0x" + read(1).slice(24),
    fee:               BigInt("0x" + read(2)),
    recipient:         "0x" + read(3).slice(24),
    deadline:          BigInt("0x" + read(4)),
    amountIn:          BigInt("0x" + read(5)),
    amountOutMinimum:  BigInt("0x" + read(6)),
    sqrtPriceLimitX96: BigInt("0x" + read(7)),
  };
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

const { test, summary } = makeRunner();

// ---------------------------------------------------------------------------
// quote 한 번 조회해서 이후 테스트에서 재사용
// ---------------------------------------------------------------------------

console.log("\n[swap build-swap — fluxion USDC → wTSLAx]");

const quoteRes = runCli([
  "defi", "swap-quote",
  "--in", "USDC",
  "--out", "WTSLAX",
  "--amount", "10",
  "--provider", "fluxion",
]);

// ---------------------------------------------------------------------------
// 1. quote 응답 구조
// ---------------------------------------------------------------------------

// [허용] quote 응답이 정상 구조여야 한다
test("defi swap-quote 가 fluxion USDC → wTSLAx 견적을 반환한다", () => {
  assert.ok(!quoteRes.error, `quote 실패: ${quoteRes.stderr}`);
  assert.ok(quoteRes.minimum_out_raw, "minimum_out_raw 가 없습니다.");
  assert.ok(quoteRes.estimated_out_raw, "estimated_out_raw 가 없습니다.");
  assert.strictEqual(quoteRes.provider, "fluxion");
});

// ---------------------------------------------------------------------------
// 2. 트랜잭션 기본 구조
// ---------------------------------------------------------------------------

// [허용] build-swap 트랜잭션이 정상 생성되어야 한다
test("build-swap 트랜잭션이 생성된다", () => {
  assert.ok(!quoteRes.error, `선행 quote 실패: ${quoteRes.stderr}`);
  const res = runCli([
    "swap", "build-swap",
    "--provider", "fluxion",
    "--in", "USDC", "--out", "WTSLAX",
    "--amount", "10",
    "--recipient", RECIPIENT,
    "--amount-out-min", quoteRes.minimum_out_raw,
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.intent, "swap");
  assertUnsignedTx(res.unsigned_tx);
});

// [허용] unsigned_tx.to 가 Fluxion 라우터 주소여야 한다
test("unsigned_tx.to 가 Fluxion 라우터 주소이다", () => {
  assert.ok(!quoteRes.error, `선행 quote 실패: ${quoteRes.stderr}`);
  const res = runCli([
    "swap", "build-swap",
    "--provider", "fluxion",
    "--in", "USDC", "--out", "WTSLAX",
    "--amount", "10",
    "--recipient", RECIPIENT,
    "--amount-out-min", quoteRes.minimum_out_raw,
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.unsigned_tx.to.toLowerCase(), FLUXION_ROUTER, `to 불일치: ${res.unsigned_tx.to}`);
});

// [허용] calldata 앞 4바이트가 exactInputSingle 셀렉터여야 한다
test("calldata 앞 4바이트가 exactInputSingle 셀렉터이다 (0x414bf389)", () => {
  assert.ok(!quoteRes.error, `선행 quote 실패: ${quoteRes.stderr}`);
  const res = runCli([
    "swap", "build-swap",
    "--provider", "fluxion",
    "--in", "USDC", "--out", "WTSLAX",
    "--amount", "10",
    "--recipient", RECIPIENT,
    "--amount-out-min", quoteRes.minimum_out_raw,
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(
    res.unsigned_tx.data.toLowerCase().startsWith(EXACT_INPUT_SINGLE_SELECTOR),
    `셀렉터 불일치: ${res.unsigned_tx.data.slice(0, 10)}`
  );
});

// ---------------------------------------------------------------------------
// 3. calldata 파라미터 정확성
// ---------------------------------------------------------------------------

// [허용] calldata 파라미터가 올바르게 인코딩되어야 한다
test("calldata — tokenIn/tokenOut/recipient/amountIn/amountOutMinimum 이 올바르게 인코딩된다", () => {
  assert.ok(!quoteRes.error, `선행 quote 실패: ${quoteRes.stderr}`);
  const res = runCli([
    "swap", "build-swap",
    "--provider", "fluxion",
    "--in", "USDC", "--out", "WTSLAX",
    "--amount", "10",
    "--recipient", RECIPIENT,
    "--amount-out-min", quoteRes.minimum_out_raw,
  ]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);

  const p = decodeExactInputSingle(res.unsigned_tx.data);

  assert.strictEqual(p.tokenIn, USDC_CONTRACT, `tokenIn 불일치: ${p.tokenIn}`);
  assert.strictEqual(p.tokenOut, WTSLAX_CONTRACT, `tokenOut 불일치: ${p.tokenOut}`);
  assert.strictEqual(p.recipient, RECIPIENT.toLowerCase(), `recipient 불일치: ${p.recipient}`);
  // 10 USDC = 10_000_000 (decimals 6)
  assert.strictEqual(p.amountIn, 10_000_000n, `amountIn 불일치: ${p.amountIn}`);
  assert.strictEqual(
    p.amountOutMinimum,
    BigInt(quoteRes.minimum_out_raw),
    `amountOutMinimum 불일치: ${p.amountOutMinimum}`
  );
});

// ---------------------------------------------------------------------------
// 4. amount 포맷 허용/거부
// ---------------------------------------------------------------------------

// [거부] --amount-out-min 없이 build-swap 은 오류를 반환한다 (슬리피지 보호 미적용)
test("[거부] --amount-out-min 없이 build-swap 은 오류를 반환한다", () => {
  const res = runCli([
    "swap", "build-swap",
    "--provider", "fluxion",
    "--in", "USDC", "--out", "WTSLAX",
    "--amount", "10",
    "--recipient", RECIPIENT,
  ]);
  assert.ok(res.error, "거부되어야 합니다.");
});

// [거부] amount 에 0x 포함 hex 는 사용 불가
test("[거부] build-swap amount 에 0x hex ('0x989680') 는 오류를 반환한다", () => {
  const res = runCli([
    "swap", "build-swap",
    "--provider", "fluxion",
    "--in", "USDC", "--out", "WTSLAX",
    "--amount", "0x989680",
    "--recipient", RECIPIENT,
    "--amount-out-min", "1",
  ]);
  assert.ok(res.error, "거부되어야 합니다.");
});

// [거부] amount 에 0x 없는 hex (알파벳 포함) 는 사용 불가
test("[거부] build-swap amount 에 0x 없는 hex ('9A8680') 는 오류를 반환한다", () => {
  const res = runCli([
    "swap", "build-swap",
    "--provider", "fluxion",
    "--in", "USDC", "--out", "WTSLAX",
    "--amount", "9A8680",
    "--recipient", RECIPIENT,
    "--amount-out-min", "1",
  ]);
  assert.ok(res.error, "거부되어야 합니다.");
});

summary();
