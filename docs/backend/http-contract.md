# Backend HTTP Contract Foundation (T5)

## 목적

- API 응답을 성공/실패 envelope 형태로 고정한다.
- 입력 검증을 Typia 타입 계약 + 서버 경계 가드로 표준화한다.
- 페이지네이션 기본값과 상한을 명확히 정의한다.
- 에러 코드를 고정된 집합으로 관리한다.

## Response Envelope

`meta`는 자유 객체가 아니라, 허용된 메타 슬롯만 담는 구조를 사용한다.

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 1
  }
}
```

### Success

```json
{
  "success": true,
  "data": {},
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 1
    }
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {}
  }
}
```

## Fixed Error Codes

- `BAD_REQUEST`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `INTERNAL_SERVER_ERROR`

## Pagination Defaults

- `page`: `1`
- `limit`: `20`
- `maxLimit`: `100`

`GET /contract/pagination`는 위 기본값과 검증 규칙을 기준으로 동작한다.

### Success example (`GET /contract/pagination`)

```json
{
  "success": true,
  "data": {
    "page": 1,
    "limit": 20
  },
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 1
    }
  }
}
```

### Validation error example (`GET /contract/pagination?page=0`)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "issues": []
    }
  }
}
```

## Defaulting and validation semantics

- 기본값은 **파라미터가 아예 없는 경우(`undefined`)**에만 적용한다.
- 빈 문자열(`?page=`)이나 범위 초과(`?limit=101`)는 기본값으로 보정하지 않고 `VALIDATION_ERROR`를 반환한다.
