# Email Notifier 운영 정책

## 목적

Email Notifier는 짧고 신뢰 가능한 incident 리포트를 중복 없이 전달하고, LLM/증거 수집/SMTP 일부가 실패해도 최소 알림을 유지한다.

## 리스크 대응 정책

| 리스크 | 대응 방식 | Fallback | 운영 기준 | 우선순위 |
|---|---|---|---|---|
| 메일이 너무 길어짐 | 요약, 근거, 조치, 링크 중심 계층화 | 축약 모드 | 요약 2~3문장, 근거/조치/확인 최대 3개, 원인 후보 최대 2개 | P1 |
| LLM 과도한 추론 | 근거와 원인 후보 분리 | LLM 결과 폐기 후 fallback | 원인 후보가 있는데 confirmed evidence가 비어 있으면 invalid | P0 |
| 중복 incident 과다 발송 | fingerprint + incident type + service + severity + 시간 버킷 dedup | suppressed record 저장 | high/critical 즉시 발송, 동일 fingerprint는 dedup window 내 1회 | P0 |
| 자동 생성 메일 신뢰 부족 | 근거 우선 템플릿, 핵심 지표, 자동 생성 안내 | 링크 중심 기본 리포트 | 확인된 근거와 핵심 지표를 원인 후보보다 먼저 배치 | P1 |
| LLM 지연 또는 실패 | LLM timeout | 기본 incident 리포트 즉시 발송 | high/critical은 LLM 실패와 무관하게 발송 | P0 |
| Loki/Tempo 조회 실패 | source별 독립 실패 허용 | Prometheus 핵심 지표 중심 partial report | 실패 source는 비고에 미수집으로 표시 | P1 |
| 수신자 과다/부적절 | incident type/service 기반 라우팅 | 기본 SRE 그룹 | payment/checkout/infra 수신자 그룹 분리 | P2 |
| SMTP 실패 | 실패 기록 | delivery record에 failed 저장 | SMTP 실패가 incident pipeline 실패로 전파되지 않음 | P0 |
| 민감정보 노출 | 원문 dump 금지, 마스킹 | 민감정보 의심 evidence 제외 | email, token, password, api key, 긴 query parameter 마스킹 | P0 |

## 발송 유형 정책

| 유형 | 조건 | 동작 |
|---|---|---|
| Initial | dedup bucket 내 최초 high/critical incident | 즉시 이메일 발송 |
| Suppressed | 동일 fingerprint가 dedup window 내 반복 | 메일 미발송, suppressed record 저장 |
| Update | severity 상승, 영향 범위 확대, 원인 후보 명확화 | MVP 이후 후속 메일 허용 |
| Resolve | 정상화 확인 | MVP 이후 선택 발송 |
| Digest | medium 이하 반복 incident | MVP 이후 묶음 발송 |

## 현재 구현 상태

- 적용됨: 길이 제한, 근거/가설 분리, Prometheus/Loki/Tempo evidence enrichment, 핵심 지표 표시, 원인 분석 근거 표시, LLM fallback, dedup, SMTP 실패 기록, partial evidence 비고 표시, 민감정보 마스킹, 기본 수신자 라우팅.
- 다음 단계: update/resolve 메일, digest, 업무시간 정책, Slack/PagerDuty 병행.
