import { Test } from '@nestjs/testing'
import { MikroORM } from '@mikro-orm/core'
import { BadRequestException } from '@nestjs/common'

import { AppModule } from '../src/app.module'
import { HealthController } from '../src/health/health.controller'

describe('HealthController integration', () => {
  it('resolves health controller and mikro orm from module graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    const controller = moduleRef.get(HealthController)
    const orm = moduleRef.get(MikroORM)
    const response = controller.getHealth('http://localhost:7000/')

    expect(controller).toBeDefined()
    expect(orm).toBeDefined()
    expect(response.data.backendApiBaseUrl).toBe('http://localhost:7000')
    expect(() => controller.getHealth('invalid-url')).toThrow(BadRequestException)

    await orm.close(true)
    await moduleRef.close()
  })
})
