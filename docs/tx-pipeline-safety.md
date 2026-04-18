# 트랜잭션 파이프라인 안전성 가이드

## 문제 요약

`mantle-cli`로 생성한 트랜잭션 JSON을 다른 프로세스(서명 봇 등)에 전달하는 과정에서
`unsigned_tx.data`의 hex 문자열이 1글자 손상되는 문제가 발생했습니다.

손상된 hex는 odd-length 오류 또는 잘못된 calldata로 이어져 트랜잭션이 실패하거나
의도하지 않은 컨트랙트 호출이 발생할 수 있습니다.

---

## 재현 조건

| 경로 | 결과 |
|------|------|
| `mantle-cli ... > file.json` → `--transaction "$(cat file.json)"` | ✅ 정상 |
| `mantle-cli ... > file.json` → Python 재직렬화 → `--transaction "$(cat file.json)"` | ❌ hex 1글자 손상 |
| `TX_JSON=$(mantle-cli ...)` → `echo "$TX_JSON" \| bun ... --transaction "$TX_JSON"` | ❌ 손상 가능 |

---

## 원인 분석

### 1. Python JSON 재직렬화 (주요 원인)

`json.load → json.dump` 왕복은 투명한 복사가 아닙니다.

**① `separators` 기본값이 공백을 추가함**
```python
# 기본 동작 — 공백 추가됨
json.dump(tx, f)
# {"key": "value", ...}  ← 쉼표/콜론 뒤 공백

# shell 인자로 넘길 때 word splitting 발생
--transaction "{"key": "value", ...}"  # ← 공백에서 잘림
```

**② `ensure_ascii=True` (기본값) — 유니코드 이스케이프 변환**
```python
# human_summary 필드의 → 같은 특수문자가 변환됨
"Swap 10 USDC → wTSLAx"  →  "Swap 10 USDC \u2192 wTSLAx"
```
JSON 바이트 길이가 바뀌면서 이후 파싱 오프셋이 밀릴 수 있음

**③ hex string을 숫자로 변환하는 코드가 섞일 경우**
```python
# 의도치 않은 타입 변환
value = int(tx["unsigned_tx"]["value"], 16)  # "0xde0b..." → 정수
# json.dump 시 다시 정수로 출력 → hex string 소실
```

### 2. shell 변수 → 파이프 전달

```bash
TX_JSON=$(mantle-cli ...)
echo "$TX_JSON" | bun script.ts --transaction "$TX_JSON"
```

- `echo`는 `\n`, `\t` 등 이스케이프 시퀀스를 해석함
- shell 변수 안에 개행이나 특수문자가 섞이면 `$IFS` 기준으로 word splitting 발생
- JSON 필드(`human_summary`, `built_at_utc` 등)의 공백·콜론이 인자를 쪼갬

### 3. 왜 calldata 자체는 안전한가

`unsigned_tx.data`는 순수 `[0-9a-f]` 문자만 포함하므로 shell이 해석할 특수문자가 없습니다.
손상은 calldata 자체가 아닌 **JSON 전체를 처리하는 과정**에서 발생합니다.

---

## 올바른 사용법

### ✅ 파일 그대로 전달

```bash
# 1. 파일로 저장
mantle-cli swap build-swap \
  --provider fluxion \
  --in USDC --out WTSLAX \
  --amount 10 \
  --recipient 0xABC... \
  --amount-out-min 1279820130605965 \
  > tx.json

# 2. 가공 없이 그대로 전달
bun agent-token.ts sign evm-transaction \
  --transaction "$(cat tx.json)" \
  --caip2 eip155:5000 \
  --broadcast
```

### ✅ 특정 필드만 필요할 때 — jq 사용

```bash
# 필드 추출 (재직렬화 없음)
DATA=$(jq -r '.unsigned_tx.data' tx.json)
TO=$(jq -r '.unsigned_tx.to' tx.json)
VALUE=$(jq -r '.unsigned_tx.value' tx.json)
```

### ✅ Python에서 필드만 읽어야 할 때

```bash
# 재직렬화하지 말고 필요한 값만 출력
DATA=$(python3 -c "
import json, sys
tx = json.load(open('tx.json'))
print(tx['unsigned_tx']['data'])
")
```

---

## 하지 말아야 할 것

### ❌ shell 변수 → 파이프 → 인자 전달

```bash
TX_JSON=$(mantle-cli swap build-swap ...)
echo "$TX_JSON" | bun script.ts --transaction "$TX_JSON"
```

### ❌ Python JSON 재직렬화

```bash
mantle-cli swap build-swap ... > tx.json

# 읽고 다시 쓰는 순간 손상 가능
python3 -c "
import json
tx = json.load(open('tx.json'))
# ... 어떤 처리 ...
json.dump(tx, open('tx.json', 'w'))  # ← 위험
"

bun script.ts --transaction "$(cat tx.json)"  # ← 이미 손상된 파일
```

### ❌ jq로 전체 JSON 재조합 후 shell 변수로 전달

```bash
TX=$(jq '.' tx.json)                          # 전체 재직렬화
bun script.ts --transaction "$TX"             # word splitting 위험
```

---

## 검증 방법

트랜잭션을 전달하기 전에 아래 항목을 확인합니다.

```bash
# 1. hex 길이 확인 (짝수여야 함)
DATA=$(jq -r '.unsigned_tx.data' tx.json)
echo "0x 제외 길이: $((${#DATA} - 2))"
# exactInputSingle 기준 기대값: 520

# 2. odd-length 체크
python3 -c "
import json
data = json.load(open('tx.json'))['unsigned_tx']['data'][2:]  # 0x 제거
print('OK' if len(data) % 2 == 0 else 'ODD-LENGTH 오류!')
"

# 3. 셀렉터 확인
jq -r '.unsigned_tx.data' tx.json | cut -c1-10
# swap build-swap 기대값: 0x414bf389
# approve 기대값:         0x095ea7b3
# send-native 기대값:     0x (빈 calldata)
# send-token 기대값:      0xa9059cbb
```

---

## 봇에게 트랜잭션 요청할 때 지시 방법

### 트랜잭션 생성 단계 (mantle-cli 봇)

봇에게 아래 형식으로 지시합니다.

```
mantle-cli로 다음 트랜잭션을 생성하고 결과를 tx.json 파일로 저장해:
- 명령: swap build-swap
- provider: fluxion
- in: USDC, out: WTSLAX
- amount: 10
- recipient: 0xABC...
- amount-out-min: (defi swap-quote 로 먼저 조회한 minimum_out_raw 값 사용)

저장 후 tx.json 내용을 그대로 출력해줘. 절대 JSON을 가공하거나 재직렬화하지 말 것.
```

### 트랜잭션 서명/제출 단계 (서명 봇)

봇에게 아래 형식으로 지시합니다.

```
tx.json 파일을 그대로 읽어서 서명하고 제출해:

bun agent-token.ts sign evm-transaction \
  --transaction "$(cat tx.json)" \
  --caip2 eip155:5000 \
  --broadcast

주의사항:
- tx.json을 절대 수정하거나 재직렬화하지 말 것
- echo "$변수" 방식으로 파이프에 넘기지 말 것
- Python으로 JSON을 읽고 다시 쓰지 말 것
- 파일에서 특정 값이 필요하면 jq -r '.field' tx.json 으로만 추출할 것
```

### 두 봇을 연결할 때 (오케스트레이터)

봇 A(생성) → 봇 B(서명) 로 전달할 때의 지시 방법입니다.

```
봇 A가 생성한 tx.json을 봇 B에 전달할 때:

1. 봇 A: mantle-cli ... > tx.json 으로 저장만 할 것
2. 봇 B: "$(cat tx.json)" 으로 파일을 그대로 읽을 것
3. 중간에 어떤 봇도 JSON을 파싱하거나 재직렬화하지 말 것
4. 전달 전 반드시 아래 검증 실행:
   - jq -r '.unsigned_tx.data' tx.json | wc -c  → 522 이상이어야 함
   - jq -r '.unsigned_tx.data' tx.json | cut -c1-10  → 셀렉터 확인
```

---

## 핵심 원칙

> **CLI가 생성한 파일을 가공 없이 그대로 전달한다.**
> JSON을 읽고 다시 쓰는 순간 hex가 깨질 수 있다.
> 필드 추출은 `jq -r` 또는 Python `print()` 로만 한다.
