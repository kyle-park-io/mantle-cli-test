/**
 * mantle-cli chain 명령어 테스트
 *
 * 테스트 항목:
 *  1. chain status — 블록 높이 및 가스 가격 조회
 *  2. chain estimate-gas — send-native 트랜잭션 기반 가스 추정
 *     - from: 0x5Cf08f46628B6D8ae56B1cdd5197FD12172De47e
 *     - to:   0xb01edda2b28d8737deb4ba9195e4299e37c2beb2
 */

import assert from "assert";
import { runCli, makeRunner } from "../utils/cli.js";

const { test, summary } = makeRunner();

const FROM = "0x5Cf08f46628B6D8ae56B1cdd5197FD12172De47e";
const TO = "0xb01edda2b28d8737deb4ba9195e4299e37c2beb2";

// ---------------------------------------------------------------------------
// 1. chain status — 블록 높이 + 가스
// ---------------------------------------------------------------------------

console.log("\n[chain status]");

test("chain status 가 성공적으로 응답한다", () => {
  const res = runCli(["chain", "status"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
});

test("block_number 가 양의 정수이다", () => {
  const res = runCli(["chain", "status"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(res.block_number !== undefined, "block_number 필드가 없습니다.");
  assert.ok(Number(res.block_number) > 0, `block_number 가 양의 정수가 아닙니다: ${res.block_number}`);
});

test("gas_price_wei 가 존재하고 0보다 크다", () => {
  const res = runCli(["chain", "status"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(res.gas_price_wei !== undefined, "gas_price_wei 필드가 없습니다.");
  assert.ok(Number(res.gas_price_wei) > 0, `gas_price_wei 가 0보다 크지 않습니다: ${res.gas_price_wei}`);
});

test("gas_price_gwei 가 존재하고 0보다 크다", () => {
  const res = runCli(["chain", "status"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(res.gas_price_gwei !== undefined, "gas_price_gwei 필드가 없습니다.");
  assert.ok(parseFloat(res.gas_price_gwei) > 0, `gas_price_gwei 가 0보다 크지 않습니다: ${res.gas_price_gwei}`);
});

test("chain_id 가 5000 (Mantle mainnet) 이다", () => {
  const res = runCli(["chain", "status"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(Number(res.chain_id), 5000, `chain_id 가 5000이 아닙니다: ${res.chain_id}`);
});

// ---------------------------------------------------------------------------
// 2. chain estimate-gas — send-native 기반
// ---------------------------------------------------------------------------

console.log("\n[chain estimate-gas — send-native 기반]");

function buildSendNativeTx(amount = "0.1") {
  return runCli(["transfer", "send-native", "--to", TO, "--amount", amount]);
}

test("send-native unsigned_tx 기반 estimate-gas 가 성공한다", () => {
  const tx = buildSendNativeTx();
  assert.ok(!tx.error, `send-native 실패: ${tx.stderr}`);
  const { to, data, value } = tx.unsigned_tx;

  const res = runCli(["chain", "estimate-gas", "--to", to, "--from", FROM, "--data", data, "--value", value]);
  assert.ok(!res.error, `estimate-gas 실패: ${res.stderr}`);
});

test("gas_limit 필드가 존재한다", () => {
  const tx = buildSendNativeTx();
  assert.ok(!tx.error, `send-native 실패: ${tx.stderr}`);
  const { to, data, value } = tx.unsigned_tx;

  const res = runCli(["chain", "estimate-gas", "--to", to, "--from", FROM, "--data", data, "--value", value]);
  assert.ok(!res.error, `estimate-gas 실패: ${res.stderr}`);
  assert.ok(res.gas_limit !== undefined, `gas_limit 필드가 없습니다. 키: ${Object.keys(res).join(", ")}`);
});

test("gas_limit 이 21000 이상이다 (순수 전송 최소값)", () => {
  const tx = buildSendNativeTx();
  assert.ok(!tx.error, `send-native 실패: ${tx.stderr}`);
  const { to, data, value } = tx.unsigned_tx;

  const res = runCli(["chain", "estimate-gas", "--to", to, "--from", FROM, "--data", data, "--value", value]);
  assert.ok(!res.error, `estimate-gas 실패: ${res.stderr}`);
  assert.ok(Number(res.gas_limit) >= 21000, `gas_limit 이 21000 미만입니다: ${res.gas_limit}`);
});

test("estimated_fee_wei 가 존재하고 0보다 크다", () => {
  const tx = buildSendNativeTx();
  assert.ok(!tx.error, `send-native 실패: ${tx.stderr}`);
  const { to, data, value } = tx.unsigned_tx;

  const res = runCli(["chain", "estimate-gas", "--to", to, "--from", FROM, "--data", data, "--value", value]);
  assert.ok(!res.error, `estimate-gas 실패: ${res.stderr}`);
  assert.ok(res.estimated_fee_wei !== undefined, "estimated_fee_wei 필드가 없습니다.");
  assert.ok(Number(res.estimated_fee_wei) > 0, `estimated_fee_wei 가 0보다 크지 않습니다: ${res.estimated_fee_wei}`);
});

test("from 주소가 응답에 그대로 반영된다", () => {
  const tx = buildSendNativeTx();
  assert.ok(!tx.error, `send-native 실패: ${tx.stderr}`);
  const { to, data, value } = tx.unsigned_tx;

  const res = runCli(["chain", "estimate-gas", "--to", to, "--from", FROM, "--data", data, "--value", value]);
  assert.ok(!res.error, `estimate-gas 실패: ${res.stderr}`);
  assert.strictEqual(res.from?.toLowerCase(), FROM.toLowerCase(), `from 주소 불일치: ${res.from}`);
});

test("--to 없이 estimate-gas 를 실행하면 오류를 반환한다", () => {
  const res = runCli(["chain", "estimate-gas", "--from", FROM, "--data", "0x", "--value", "0x0"]);
  assert.ok(res.error, "--to 없이 성공하면 안 됩니다.");
});

// ---------------------------------------------------------------------------
// 결과 요약
// ---------------------------------------------------------------------------

summary();
