import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'health_check' })
export class HealthCheckEntity {
  @PrimaryKey()
  id!: number

  @Property({ defaultRaw: 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
