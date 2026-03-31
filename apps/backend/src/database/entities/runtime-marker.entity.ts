import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * TODO(backlog): Remove this placeholder entity once real domain entities own the MikroORM bootstrap.
 */
@Entity({ tableName: 'runtime_markers' })
export class RuntimeMarkerEntity {
	@PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
	public id!: string;

	@Property({ type: 'text' })
	public name!: string;

	@Property({ type: 'timestamptz', defaultRaw: 'now()' })
	public createdAt!: Date;
}
