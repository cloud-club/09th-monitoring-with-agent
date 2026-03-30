import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

import { observeHttpRequest } from './metrics-registry'

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  public use(request: Request, response: Response, next: NextFunction): void {
    response.on('finish', () => {
      const routePath = request.route?.path

      observeHttpRequest(
        request.method,
        typeof routePath === 'string' ? routePath : request.path,
        response.statusCode
      )
    })

    next()
  }
}
