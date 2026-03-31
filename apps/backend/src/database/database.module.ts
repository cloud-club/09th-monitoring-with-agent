import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import mikroOrmConfig from './mikro-orm.config';
import { PrismaService } from './prisma.service';

@Module({
	imports: [MikroOrmModule.forRoot(mikroOrmConfig)],
	providers: [PrismaService],
	exports: [PrismaService],
})
export class DatabaseModule {}
