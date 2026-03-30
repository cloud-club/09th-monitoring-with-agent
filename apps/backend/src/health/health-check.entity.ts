import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'health_check' })
export class HealthCheckEntity {
  @PrimaryKey({ type: 'number' })
  id!: number

  @Property({ type: 'Date', defaultRaw: 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
