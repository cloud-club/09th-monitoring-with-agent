import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
	public async onModuleDestroy(): Promise<void> {
		await this.$disconnect();
	}
}
