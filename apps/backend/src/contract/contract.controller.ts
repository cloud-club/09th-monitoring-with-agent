import { Controller, Get, Query } from '@nestjs/common'

import { ok } from '../http/contracts'
import { createPaginationMeta, parsePaginationQuery } from '../http/pagination'
import { BadRequestError } from '../http/http-error'

@Controller('/contract')
export class ContractController {
  @Get('/pagination')
  public getPagination(@Query() query: Record<string, unknown>) {
    const parsed = parsePaginationQuery(query)

    return ok(
      {
        page: parsed.page,
        limit: parsed.limit
      },
      createPaginationMeta(parsed, 0)
    )
  }

  @Get('/bad-request')
  public getBadRequest(): never {
    throw new BadRequestError('Bad request sample')
  }

  @Get('/error')
  public getError(): never {
    throw new Error('Unexpected runtime failure')
  }
}
