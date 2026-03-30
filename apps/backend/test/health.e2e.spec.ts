import { Test } from '@nestjs/testing'
import { type INestApplication } from '@nestjs/common'
import request from 'supertest'

import { AppModule } from '../src/app.module'

describe('Health endpoint (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /health returns configured stack response', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .query({ backendApiBaseUrl: 'http://localhost:9900/' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'ok',
        stack: ['nest', 'mikro', 'jest', 'typia'],
        backendApiBaseUrl: 'http://localhost:9900'
      }
    })
  })

  it('GET /health returns 400 for invalid backendApiBaseUrl', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .query({ backendApiBaseUrl: 'invalid-url' })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('backendApiBaseUrl must be a valid http(s) URL')
  })
})
