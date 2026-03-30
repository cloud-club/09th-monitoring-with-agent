import type { tags } from 'typia'

export interface HealthQueryDto {
  readonly backendApiBaseUrl?: (string & tags.MinLength<1>) | undefined
}
