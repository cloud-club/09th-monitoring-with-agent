import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';

import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';

@Module({
	imports: [CatalogModule],
	controllers: [RecommendationController],
	providers: [RecommendationService],
})
export class RecommendationModule {}
