import { defineConfig } from '@mikro-orm/postgresql'

import { RuntimeMarkerEntity } from './entities/runtime-marker.entity'

const mikroOrmConfig = defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: [RuntimeMarkerEntity],
  entitiesTs: [RuntimeMarkerEntity],
  migrations: {
    path: 'dist/migrations',
    pathTs: 'src/migrations'
  },
  connect: false
})

export default mikroOrmConfig
