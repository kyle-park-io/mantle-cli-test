/**
 * shell 파이프라인 vs 파일 경유 hex 데이터 손상 테스트
 *
 * 검증 항목:
 *  1. mantle-cli 로 실제 스왑 트랜잭션 생성
 *  2. echo "$VAR" | 파이프라인으로 calldata 전달 시 손상 여부
 *  3. 파일 경유(cat file) 로 calldata 전달 시 손상 여부
 *  4. odd-length hex 발생 여부 (각 경로별)
 *  5. 원본 calldata와 각 경로 결과 일치 여부
 */

import assert from "assert";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadPrimaryAddress } from "../utils/addresses.js";
import { runCli } from "../utils/cli.js";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

const RECIPIENT = loadPrimaryAddress();
const TMP_TX_FILE = join(tmpdir(), "mantle_swap_tx_test.json");
const TMP_DATA_FILE = join(tmpdir(), "mantle_swap_data_test.txt");

/**
 * hex 문자열 검증
 * @param {string} hex - 검사할 문자열 (0x 접두사 포함 또는 미포함)
 * @returns {{ valid: boolean, oddLength: boolean, reason: string }}
 */
function validateHex(hex) {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  const oddLength = stripped.length % 2 !== 0;
  const invalidChars = /[^0-9a-fA-F]/.test(stripped);
  return {
    valid: !oddLength && !invalidChars,
    oddLength,
    invalidChars,
    length: stripped.length,
  };
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
// 준비: 실제 스왑 트랜잭션 생성
// ---------------------------------------------------------------------------

console.log("\n[준비] 실제 스왑 트랜잭션 생성 (fluxion USDC 0.5 → wTSLAx)");

const quoteRes = runCli([
  "defi", "swap-quote",
  "--in", "USDC",
  "--out", "WTSLAX",
  "--amount", "0.5",
  "--provider", "fluxion",
]);

if (quoteRes.error) {
  console.error("quote 실패, 테스트 중단:", quoteRes.stderr);
  process.exit(1);
}

const swapRes = runCli([
  "swap", "build-swap",
  "--provider", "fluxion",
  "--in", "USDC",
  "--out", "WTSLAX",
  "--amount", "0.5",
  "--recipient", RECIPIENT,
  "--amount-out-min", quoteRes.minimum_out_raw,
]);

if (swapRes.error) {
  console.error("swap 트랜잭션 생성 실패, 테스트 중단:", swapRes.stderr);
  process.exit(1);
}

const ORIGINAL_DATA = swapRes.unsigned_tx.data;
const TX_JSON = JSON.stringify(swapRes);

console.log(`  원본 calldata 길이: ${ORIGINAL_DATA.length - 2} (0x 제외)`);
console.log(`  TX JSON 크기: ${Buffer.byteLength(TX_JSON, "utf8")} bytes`);

// 파일로 저장
writeFileSync(TMP_TX_FILE, TX_JSON, "utf8");
writeFileSync(TMP_DATA_FILE, ORIGINAL_DATA, "utf8");

// ---------------------------------------------------------------------------
// 1. 원본 calldata 검증
// ---------------------------------------------------------------------------

console.log("\n[원본 calldata 검증]");

test("원본 calldata 가 유효한 hex 이다", () => {
  const result = validateHex(ORIGINAL_DATA);
  assert.ok(!result.oddLength, `odd-length 발생! 길이: ${result.length}`);
  assert.ok(!result.invalidChars, "유효하지 않은 문자 포함");
});

test("원본 calldata 길이가 exactInputSingle 구조와 일치한다 (selector 4 + params 8×32 = 260 bytes)", () => {
  const stripped = ORIGINAL_DATA.slice(2);
  assert.strictEqual(stripped.length, 520, `길이 불일치: ${stripped.length} (기대: 520)`);
});

// ---------------------------------------------------------------------------
// 2. echo 파이프라인 경유
// ---------------------------------------------------------------------------

console.log("\n[echo 파이프라인 경유]");

// echo "$VAR" 로 calldata 추출
const echoResult = execSync(`echo "${ORIGINAL_DATA}"`, { encoding: "utf8" }).trim();

test("echo 파이프라인 경유 후 odd-length 발생 여부 확인", () => {
  const result = validateHex(echoResult);
  if (result.oddLength) {
    // 손상 확인 — 테스트는 실패하지 않고 사실을 기록
    throw new Error(
      `odd-length 발생! 원본: ${ORIGINAL_DATA.length - 2}자, echo 후: ${result.length}자`
    );
  }
  assert.ok(!result.oddLength, `odd-length 발생: ${result.length}`);
});

test("echo 파이프라인 경유 후 원본과 일치 여부 확인", () => {
  assert.strictEqual(
    echoResult,
    ORIGINAL_DATA,
    `데이터 손상 발생!\n원본: ${ORIGINAL_DATA}\necho: ${echoResult}`
  );
});

// echo로 JSON 전체를 파이프할 때 data 필드 추출
const echoPipedData = execSync(
  `echo '${TX_JSON.replace(/'/g, "'\\''")}' | node -e "process.stdin.setEncoding('utf8'); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ const tx=JSON.parse(d); process.stdout.write(tx.unsigned_tx.data); })"`,
  { encoding: "utf8" }
);

test("echo로 JSON 파이프 후 data 필드 파싱 — odd-length 여부", () => {
  const result = validateHex(echoPipedData);
  if (result.oddLength) {
    throw new Error(`odd-length 발생! 원본: ${ORIGINAL_DATA.length - 2}자, 파이프 후: ${result.length}자`);
  }
  assert.ok(!result.oddLength);
});

test("echo로 JSON 파이프 후 data 필드가 원본과 일치", () => {
  assert.strictEqual(
    echoPipedData,
    ORIGINAL_DATA,
    `데이터 손상!\n원본: ${ORIGINAL_DATA}\n파이프: ${echoPipedData}`
  );
});

// ---------------------------------------------------------------------------
// 3. 파일 경유
// ---------------------------------------------------------------------------

console.log("\n[파일 경유]");

// 파일에서 직접 읽기
const fileData = readFileSync(TMP_DATA_FILE, "utf8").trim();

test("파일 경유 후 odd-length 발생 여부 확인", () => {
  const result = validateHex(fileData);
  assert.ok(!result.oddLength, `odd-length 발생! 길이: ${result.length}`);
});

test("파일 경유 후 원본과 완전히 일치한다", () => {
  assert.strictEqual(fileData, ORIGINAL_DATA, "파일 경유 데이터 손상");
});

// JSON 파일에서 data 필드 파싱
const fileParsedData = execSync(
  `node -e "const tx=JSON.parse(require('fs').readFileSync('${TMP_TX_FILE}','utf8')); process.stdout.write(tx.unsigned_tx.data);"`,
  { encoding: "utf8" }
);

test("JSON 파일 파싱 후 data 필드 — odd-length 없음", () => {
  const result = validateHex(fileParsedData);
  assert.ok(!result.oddLength, `odd-length 발생! 길이: ${result.length}`);
});

test("JSON 파일 파싱 후 data 필드가 원본과 일치한다", () => {
  assert.strictEqual(fileParsedData, ORIGINAL_DATA, "파일 파싱 데이터 손상");
});

// ---------------------------------------------------------------------------
// 4. echo vs 파일 직접 비교
// ---------------------------------------------------------------------------

console.log("\n[echo vs 파일 비교]");

test("echo 경유 calldata 와 파일 경유 calldata 가 일치한다", () => {
  assert.strictEqual(
    echoResult,
    fileData,
    `경로별 결과 불일치!\necho: ${echoResult.slice(0, 40)}...\nfile: ${fileData.slice(0, 40)}...`
  );
});

test("echo JSON 파이프 파싱과 파일 JSON 파싱 결과가 일치한다", () => {
  assert.strictEqual(
    echoPipedData,
    fileParsedData,
    `경로별 JSON 파싱 결과 불일치`
  );
});

// ---------------------------------------------------------------------------
// 정리
// ---------------------------------------------------------------------------

try { unlinkSync(TMP_TX_FILE); } catch {}
try { unlinkSync(TMP_DATA_FILE); } catch {}

// ---------------------------------------------------------------------------
// 결과 요약
// ---------------------------------------------------------------------------

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;

console.log(`\n결과: ${passed} 통과 / ${failed} 실패 / ${results.length} 전체\n`);

if (failed > 0) {
  process.exit(1);
}
