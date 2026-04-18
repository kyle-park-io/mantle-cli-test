import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const ROOT_DIR = resolve(fileURLToPath(import.meta.url), "../../");

/**
 * 루트의 address 파일에서 주소 목록을 읽어 반환합니다.
 * 각 줄의 공백을 제거하고, 빈 줄과 주석(#)은 무시합니다.
 *
 * @returns {string[]} 주소 배열
 */
export function loadAddresses() {
  const filePath = resolve(ROOT_DIR, "address");
  const content = readFileSync(filePath, "utf8");

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * 루트 address 파일의 첫 번째 주소를 반환합니다.
 *
 * @returns {string} 첫 번째 주소
 */
export function loadPrimaryAddress() {
  const addresses = loadAddresses();
  if (addresses.length === 0) {
    throw new Error("address 파일이 비어 있습니다.");
  }
  return addresses[0];
}
