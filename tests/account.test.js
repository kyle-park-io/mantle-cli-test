/**
 * mantle-cli account 명령어 테스트
 *
 * 테스트 항목:
 *  1. account balance   — MNT 잔액 조회
 *  2. account token-balances — ERC-20 잔액 일괄 조회
 *  3. account allowances    — ERC-20 허용량 조회
 */

import assert from "assert";
import { runCli, makeRunner } from "../utils/cli.js";

const { test, summary } = makeRunner();

const WALLET = "0x5Cf08f46628B6D8ae56B1cdd5197FD12172De47e";
const AGNI_ROUTER = "0x319B69888b0d11cEC22caA5034e25FfFBDc88421";
const USDC_ADDRESS = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9".toLowerCase();

// ---------------------------------------------------------------------------
// 1. account balance
// ---------------------------------------------------------------------------

console.log("\n[account balance]");

test("balance 가 성공적으로 응답한다", () => {
  const res = runCli(["account", "balance", WALLET]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
});

test("address 가 요청한 지갑 주소와 일치한다", () => {
  const res = runCli(["account", "balance", WALLET]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.address.toLowerCase(), WALLET.toLowerCase());
});

test("balance_wei 가 존재하고 숫자 문자열이다", () => {
  const res = runCli(["account", "balance", WALLET]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(res.balance_wei !== undefined, "balance_wei 필드가 없습니다.");
  assert.ok(/^\d+$/.test(res.balance_wei), `balance_wei 가 숫자 문자열이 아닙니다: ${res.balance_wei}`);
});

test("balance_mnt 가 존재하고 0 이상의 소수이다", () => {
  const res = runCli(["account", "balance", WALLET]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(res.balance_mnt !== undefined, "balance_mnt 필드가 없습니다.");
  assert.ok(parseFloat(res.balance_mnt) >= 0, `balance_mnt 가 유효하지 않습니다: ${res.balance_mnt}`);
});

test("network 가 mainnet 이다", () => {
  const res = runCli(["account", "balance", WALLET]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.network, "mainnet");
});

test("block_number 가 양의 정수이다", () => {
  const res = runCli(["account", "balance", WALLET]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(Number(res.block_number) > 0, `block_number 가 양의 정수가 아닙니다: ${res.block_number}`);
});

// ---------------------------------------------------------------------------
// 2. account token-balances
// ---------------------------------------------------------------------------

console.log("\n[account token-balances]");

test("token-balances 가 성공적으로 응답한다", () => {
  const res = runCli(["account", "token-balances", WALLET, "--tokens", "USDC,USDT"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
});

test("balances 배열이 존재한다", () => {
  const res = runCli(["account", "token-balances", WALLET, "--tokens", "USDC,USDT"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(Array.isArray(res.balances), "balances 가 배열이 아닙니다.");
});

test("요청한 토큰 수만큼 결과가 반환된다 (USDC, USDT → 2개)", () => {
  const res = runCli(["account", "token-balances", WALLET, "--tokens", "USDC,USDT"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.balances.length, 2, `결과 수 불일치: ${res.balances.length}`);
});

test("USDC 항목의 token_address 가 올바르다", () => {
  const res = runCli(["account", "token-balances", WALLET, "--tokens", "USDC"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  const usdc = res.balances.find((b) => b.symbol === "USDC");
  assert.ok(usdc, "USDC 항목이 없습니다.");
  assert.strictEqual(usdc.token_address.toLowerCase(), USDC_ADDRESS);
});

test("USDC balance_raw 가 숫자 문자열이다", () => {
  const res = runCli(["account", "token-balances", WALLET, "--tokens", "USDC"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  const usdc = res.balances.find((b) => b.symbol === "USDC");
  assert.ok(usdc, "USDC 항목이 없습니다.");
  assert.ok(/^\d+$/.test(usdc.balance_raw), `balance_raw 가 숫자 문자열이 아닙니다: ${usdc.balance_raw}`);
});

test("USDC decimals 가 6 이다", () => {
  const res = runCli(["account", "token-balances", WALLET, "--tokens", "USDC"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  const usdc = res.balances.find((b) => b.symbol === "USDC");
  assert.ok(usdc, "USDC 항목이 없습니다.");
  assert.strictEqual(usdc.decimals, 6);
});

test("partial 이 false 이다 (모든 조회 성공)", () => {
  const res = runCli(["account", "token-balances", WALLET, "--tokens", "USDC,USDT"]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.partial, false);
});

// ---------------------------------------------------------------------------
// 3. account allowances
// ---------------------------------------------------------------------------

console.log("\n[account allowances]");

test("allowances 가 성공적으로 응답한다", () => {
  const res = runCli(["account", "allowances", WALLET, "--pairs", `USDC:${AGNI_ROUTER}`]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
});

test("allowances 배열이 존재한다", () => {
  const res = runCli(["account", "allowances", WALLET, "--pairs", `USDC:${AGNI_ROUTER}`]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(Array.isArray(res.allowances), "allowances 가 배열이 아닙니다.");
});

test("요청한 pair 수만큼 결과가 반환된다 (1개)", () => {
  const res = runCli(["account", "allowances", WALLET, "--pairs", `USDC:${AGNI_ROUTER}`]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.allowances.length, 1);
});

test("allowance 항목의 token_symbol 이 USDC 이다", () => {
  const res = runCli(["account", "allowances", WALLET, "--pairs", `USDC:${AGNI_ROUTER}`]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.allowances[0].token_symbol, "USDC");
});

test("allowance 항목의 spender 가 요청한 주소와 일치한다", () => {
  const res = runCli(["account", "allowances", WALLET, "--pairs", `USDC:${AGNI_ROUTER}`]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.allowances[0].spender.toLowerCase(), AGNI_ROUTER.toLowerCase());
});

test("allowance_raw 가 숫자 문자열이다", () => {
  const res = runCli(["account", "allowances", WALLET, "--pairs", `USDC:${AGNI_ROUTER}`]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.ok(/^\d+$/.test(res.allowances[0].allowance_raw), `allowance_raw 가 숫자 문자열이 아닙니다: ${res.allowances[0].allowance_raw}`);
});

test("owner 가 요청한 지갑 주소와 일치한다", () => {
  const res = runCli(["account", "allowances", WALLET, "--pairs", `USDC:${AGNI_ROUTER}`]);
  assert.ok(!res.error, `CLI 실패: ${res.stderr}`);
  assert.strictEqual(res.owner.toLowerCase(), WALLET.toLowerCase());
});

// ---------------------------------------------------------------------------
// 결과 요약
// ---------------------------------------------------------------------------

summary();
