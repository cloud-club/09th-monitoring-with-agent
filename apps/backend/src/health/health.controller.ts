import { Controller, Get } from '@nestjs/common'

import { ok } from '../http/contracts'

@Controller()
export class HealthController {
  @Get('/health')
  public getHealth() {
    return ok({ status: 'ok' })
  }
}
